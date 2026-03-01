import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDb } from '@/db/index';
import { scheduledTasks, userSettings, messages } from '@/db/schema';
import { eq, and, lte, desc } from 'drizzle-orm';
import { executeAction } from '@/lib/executeAction';
import { getAccessToken } from '@/lib/feishu';

const CRON_SECRET = 'mb-cron-2026-secret';

function computeNextTrigger(recurrence: string | null, currentTrigger: number): number | null {
    if (!recurrence) return null;
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
export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        if (url.searchParams.get('key') !== CRON_SECRET) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { env } = await getCloudflareContext();
        const db = getDb(env.DB);
        const now = Date.now();

        const dueTasks = await db.select().from(scheduledTasks)
            .where(and(eq(scheduledTasks.status, 'active'), lte(scheduledTasks.triggerAt, now)));

        if (dueTasks.length === 0) {
            return NextResponse.json({ success: true, triggered: 0 });
        }

        const userResults: Record<string, string[]> = {};

        for (const task of dueTasks) {
            // Parse action — support full action JSON or legacy format
            let actionCmd: any;
            try {
                const payload = JSON.parse(task.actionPayload);
                if (payload.action) {
                    // New format: full action JSON stored in actionPayload
                    actionCmd = payload;
                } else {
                    // Legacy format: reconstruct from actionType + actionPayload
                    actionCmd = { action: task.actionType, ...payload };
                }
            } catch {
                actionCmd = { action: task.actionType };
            }

            const result = await executeAction(db, task.userId, actionCmd);

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
            userResults[task.userId].push(result.message);
        }

        // Send Feishu push notifications
        for (const uId of Object.keys(userResults)) {
            const notification = `📋 Magic Ball 定时任务报告\n\n${userResults[uId].join('\n\n')}`;

            // Always persist to web chat first.
            try {
                const latestMessage = await db.select({
                    sessionId: messages.sessionId,
                }).from(messages)
                    .where(eq(messages.userId, uId))
                    .orderBy(desc(messages.createdAt))
                    .limit(1);

                const targetSessionId = latestMessage[0]?.sessionId || 'default';

                await db.insert(messages).values({
                    id: crypto.randomUUID(),
                    userId: uId,
                    sessionId: targetSessionId,
                    content: notification,
                    source: 'system',
                    createdAt: Date.now(),
                });
            } catch (e) {
                console.error("Failed to save cron result to messages DB", e);
            }

            try {
                const feishuSetting = await db.select().from(userSettings)
                    .where(and(eq(userSettings.userId, uId), eq(userSettings.key, 'feishu_open_id')));
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

        return NextResponse.json({ success: true, triggered: Object.values(userResults).flat().length, results: userResults });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
