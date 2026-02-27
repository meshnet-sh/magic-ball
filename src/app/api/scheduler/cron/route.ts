import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDb } from '@/db/index';
import { scheduledTasks, ideas, userSettings } from '@/db/schema';
import { eq, and, lte } from 'drizzle-orm';
import { sendMessage, getAccessToken } from '@/lib/feishu';

// Secret key to protect this endpoint (only the cron worker should call it)
const CRON_SECRET = 'mb-cron-2026-secret';

function computeNextTrigger(recurrence: string | null, currentTrigger: number): number | null {
    if (!recurrence) return null;

    // Support "minutes:X" and "hours:X" for fine-grained intervals
    if (recurrence.startsWith('minutes:')) {
        const mins = parseInt(recurrence.split(':')[1], 10);
        if (mins > 0) return currentTrigger + mins * 60 * 1000;
    }
    if (recurrence.startsWith('hours:')) {
        const hrs = parseInt(recurrence.split(':')[1], 10);
        if (hrs > 0) return currentTrigger + hrs * 3600 * 1000;
    }

    const d = new Date(currentTrigger);
    switch (recurrence) {
        case 'daily': d.setDate(d.getDate() + 1); return d.getTime();
        case 'weekly': d.setDate(d.getDate() + 7); return d.getTime();
        case 'monthly': d.setMonth(d.getMonth() + 1); return d.getTime();
        default: return null;
    }
}

// GET /api/scheduler/cron?key=SECRET
// Called by Cloudflare Cron Worker every minute
export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const key = url.searchParams.get('key');
        if (key !== CRON_SECRET) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { env } = await getCloudflareContext();
        const db = getDb(env.DB);
        const now = Date.now();

        // Find ALL due active tasks across all users
        const dueTasks = await db.select().from(scheduledTasks)
            .where(and(
                eq(scheduledTasks.status, 'active'),
                lte(scheduledTasks.triggerAt, now)
            ));

        if (dueTasks.length === 0) {
            return NextResponse.json({ success: true, triggered: 0 });
        }

        // Group tasks by user for Feishu notification batching
        const userResults: Record<string, string[]> = {};
        let totalTriggered = 0;

        for (const task of dueTasks) {
            let payload: any = {};
            try { payload = JSON.parse(task.actionPayload); } catch { }

            let message = '';

            try {
                switch (task.actionType) {
                    case 'create_idea': {
                        const tags = payload.tags || [];
                        const content = tags.length > 0
                            ? (payload.content || task.title) + ' ' + tags.map((t: string) => `#${t}`).join(' ')
                            : (payload.content || task.title);
                        await db.insert(ideas).values({
                            id: crypto.randomUUID(),
                            userId: task.userId,
                            type: 'text',
                            content,
                            tags: JSON.stringify(tags),
                            createdAt: now,
                        });
                        message = `✅ 已自动创建笔记: "${payload.content || task.title}"`;
                        break;
                    }
                    case 'ai_prompt': {
                        // Get user Gemini settings
                        const settings = await db.select().from(userSettings)
                            .where(eq(userSettings.userId, task.userId));
                        const settingsMap: Record<string, string> = {};
                        settings.forEach(s => { settingsMap[s.key] = s.value; });
                        const apiKey = settingsMap['gemini_api_key'];
                        const model = settingsMap['gemini_model'] || 'gemini-2.0-flash';

                        if (apiKey && payload.prompt) {
                            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
                            const geminiRes = await fetch(geminiUrl, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    contents: [{ role: 'user', parts: [{ text: payload.prompt }] }],
                                    generationConfig: { temperature: 0.5 }
                                })
                            });
                            const data: any = await geminiRes.json();
                            const aiResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text || '(无响应)';
                            // Save AI response as idea
                            await db.insert(ideas).values({
                                id: crypto.randomUUID(),
                                userId: task.userId,
                                type: 'text',
                                content: `[AI 定时任务: ${task.title}]\n${aiResponse}`,
                                tags: JSON.stringify(['ai-scheduled']),
                                createdAt: now,
                            });
                            message = `🤖 AI 任务 "${task.title}" 已执行:\n${aiResponse.substring(0, 200)}`;
                        } else {
                            message = `⚠️ AI 任务 "${task.title}" 缺少 API Key 或 prompt`;
                        }
                        break;
                    }
                    case 'reminder': {
                        message = `⏰ 提醒: ${payload.message || task.title}`;
                        break;
                    }
                    default:
                        message = `⚙️ 任务 "${task.title}" (${task.actionType})`;
                }
            } catch (err: any) {
                message = `❌ 任务 "${task.title}" 执行失败: ${err.message}`;
            }

            // Update task: next trigger or mark completed
            const nextTrigger = computeNextTrigger(task.recurrence, task.triggerAt);
            if (nextTrigger) {
                await db.update(scheduledTasks)
                    .set({ lastTriggered: now, triggerAt: nextTrigger })
                    .where(eq(scheduledTasks.id, task.id));
            } else {
                await db.update(scheduledTasks)
                    .set({ lastTriggered: now, status: 'completed' })
                    .where(eq(scheduledTasks.id, task.id));
            }

            if (!userResults[task.userId]) userResults[task.userId] = [];
            userResults[task.userId].push(message);
            totalTriggered++;
        }

        // Send Feishu push notifications for each user
        for (const uId of Object.keys(userResults)) {
            try {
                const feishuSetting = await db.select().from(userSettings)
                    .where(and(eq(userSettings.userId, uId), eq(userSettings.key, 'feishu_open_id')));
                if (feishuSetting.length > 0) {
                    const openId = feishuSetting[0].value;
                    const msgs = userResults[uId];
                    const notification = `📋 Magic Ball 定时任务报告\n\n${msgs.join('\n\n')}`;
                    // Send via Feishu using open_id
                    const token = await getAccessToken();
                    await fetch('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`,
                        },
                        body: JSON.stringify({
                            receive_id: openId,
                            content: JSON.stringify({ text: notification }),
                            msg_type: 'text',
                        }),
                    });
                }
            } catch { /* Feishu push failed, skip */ }
        }

        return NextResponse.json({ success: true, triggered: totalTriggered, results: userResults });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
