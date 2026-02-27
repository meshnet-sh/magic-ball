import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDb } from '@/db/index';
import { scheduledTasks, ideas, userSettings } from '@/db/schema';
import { eq, and, lte } from 'drizzle-orm';

function getUserIdFromCookie(request: Request) {
    const cookieHeader = request.headers.get('cookie') || "";
    const match = cookieHeader.match(/auth_session=([^;]+)/);
    return match ? match[1] : null;
}

function computeNextTrigger(recurrence: string | null, currentTrigger: number): number | null {
    if (!recurrence) return null; // one-time task → no next trigger

    const d = new Date(currentTrigger);
    switch (recurrence) {
        case 'daily':
            d.setDate(d.getDate() + 1);
            return d.getTime();
        case 'weekly':
            d.setDate(d.getDate() + 7);
            return d.getTime();
        case 'monthly':
            d.setMonth(d.getMonth() + 1);
            return d.getTime();
        default:
            return null;
    }
}

// POST — check & execute all due tasks for the current user
export async function POST(request: Request) {
    try {
        const userId = getUserIdFromCookie(request);
        if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const { env } = await getCloudflareContext();
        const db = getDb(env.DB);
        const now = Date.now();

        // Find all due active tasks
        const dueTasks = await db.select().from(scheduledTasks)
            .where(and(
                eq(scheduledTasks.userId, userId),
                eq(scheduledTasks.status, 'active'),
                lte(scheduledTasks.triggerAt, now)
            ));

        const results: { taskId: string; title: string; success: boolean; message: string }[] = [];

        for (const task of dueTasks) {
            let payload: any = {};
            try { payload = JSON.parse(task.actionPayload); } catch { }

            let success = false;
            let message = '';

            try {
                switch (task.actionType) {
                    case 'create_idea': {
                        const tags = payload.tags || [];
                        const content = tags.length > 0
                            ? payload.content + ' ' + tags.map((t: string) => `#${t}`).join(' ')
                            : payload.content;
                        await db.insert(ideas).values({
                            id: crypto.randomUUID(),
                            userId,
                            type: 'text',
                            content: content || task.title,
                            tags: JSON.stringify(tags),
                            createdAt: now,
                        });
                        success = true;
                        message = `已自动创建笔记: "${payload.content || task.title}"`;
                        break;
                    }
                    case 'ai_prompt': {
                        // Get user's Gemini settings to call AI
                        const settings = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
                        const settingsMap: Record<string, string> = {};
                        settings.forEach(s => { settingsMap[s.key] = s.value; });
                        const apiKey = settingsMap['gemini_api_key'];
                        const model = settingsMap['gemini_model'] || 'gemini-flash-latest';

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
                            const aiResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
                            // Save AI response as an idea
                            await db.insert(ideas).values({
                                id: crypto.randomUUID(),
                                userId,
                                type: 'text',
                                content: `[AI 定时任务: ${task.title}]\n${aiResponse}`,
                                tags: JSON.stringify(['ai-scheduled']),
                                createdAt: now,
                            });
                            success = true;
                            message = `AI 任务已执行: "${task.title}"`;
                        } else {
                            message = 'AI 任务缺少 API Key 或 prompt';
                        }
                        break;
                    }
                    case 'reminder': {
                        // Reminders are handled client-side (the task appearing as due is the reminder)
                        success = true;
                        message = `⏰ 提醒: ${payload.message || task.title}`;
                        break;
                    }
                    default:
                        message = `未知操作类型: ${task.actionType}`;
                }
            } catch (err: any) {
                message = `执行失败: ${err.message}`;
            }

            // Update task: set lastTriggered, compute next trigger or mark completed
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

            results.push({ taskId: task.id, title: task.title, success, message });
        }

        return NextResponse.json({ success: true, triggered: results.length, results });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
