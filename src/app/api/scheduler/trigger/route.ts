import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDb } from '@/db/index';
import { scheduledTasks, ideas, userSettings } from '@/db/schema';
import { eq, and, lte } from 'drizzle-orm';

import { getVerifiedUserIdFromCookie } from '@/lib/auth';

function computeNextTrigger(recurrence: string | null, currentTrigger: number): number | null {
    if (!recurrence) return null; // one-time task → no next trigger

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
        const userId = await getVerifiedUserIdFromCookie(request);
        if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const { env } = await getCloudflareContext();
        const db = getDb(env.DB);
        const now = Date.now();

        let sessionId = 'default';
        try {
            const body: any = await request.clone().json();
            if (body && body.sessionId) sessionId = body.sessionId;
        } catch { }

        // Find all due active tasks
        const dueTasks = await db.select().from(scheduledTasks)
            .where(and(
                eq(scheduledTasks.userId, userId),
                eq(scheduledTasks.status, 'active'),
                lte(scheduledTasks.triggerAt, now)
            ));

        const results: { taskId: string; title: string; success: boolean; message: string }[] = [];
        const userResults: string[] = [];

        // Dynamic import to avoid circle dependencies if any, but straight import works
        const { executeAction } = await import('@/lib/executeAction');
        const { getAccessToken } = await import('@/lib/feishu');

        for (const task of dueTasks) {
            let actionCmd: any;
            try {
                const payload = JSON.parse(task.actionPayload);
                if (payload.action) {
                    actionCmd = payload;
                } else {
                    // Legacy ai_prompt to ai_agent translation
                    if (task.actionType === 'ai_prompt') {
                        actionCmd = { action: 'ai_agent', prompt: payload.prompt };
                    } else {
                        actionCmd = { action: task.actionType, ...payload };
                    }
                }
            } catch {
                actionCmd = { action: task.actionType };
            }

            const result = await executeAction(db, userId, actionCmd);

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

            results.push({ taskId: task.id, title: task.title, success: result.ok, message: result.message });
            userResults.push(`[${task.title}] ${result.message}`);
        }

        // Save results to web messages and send Feishu push
        if (userResults.length > 0) {
            const notification = `📋 Magic Ball Web端触发任务报告\n\n${userResults.join('\n\n')}`;

            try {
                const { messages } = await import('@/db/schema');
                await db.insert(messages).values({
                    id: crypto.randomUUID(),
                    userId,
                    sessionId,
                    content: notification,
                    source: 'system',
                    createdAt: Date.now()
                });
            } catch (e) {
                console.error("Failed to save scheduler result to messages DB", e);
            }

            try {
                const feishuSetting = await db.select().from(userSettings)
                    .where(and(eq(userSettings.userId, userId), eq(userSettings.key, 'feishu_open_id')));
                if (feishuSetting.length > 0) {
                    const token = await getAccessToken();
                    await fetch('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({
                            receive_id: feishuSetting[0].value,
                            content: JSON.stringify({ text: notification }),
                            msg_type: 'text',
                        }),
                    });
                }
            } catch { }
        }

        return NextResponse.json({ success: true, triggered: results.length, results });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
