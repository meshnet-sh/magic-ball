import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDb } from '@/db/index';
import { scheduledTasks, userSettings, messages } from '@/db/schema';
import { eq, and, lte, desc } from 'drizzle-orm';
import { getAccessToken } from '@/lib/feishu';
import { claimAndAdvanceScheduledTask, runClaimedScheduledTask } from '@/lib/schedulerRunner';

const CRON_SECRET = 'mb-cron-2026-secret';

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
            const claimed = await claimAndAdvanceScheduledTask(env.DB, task, now);
            if (!claimed) continue;

            const result = await runClaimedScheduledTask(db, task.userId, task);

            if (!userResults[task.userId]) userResults[task.userId] = [];
            userResults[task.userId].push(result.message);
        }

        // Send Feishu push notifications
        for (const uId of Object.keys(userResults)) {
            const notification = `📋 Magic Ball 定时任务报告\n\n${userResults[uId].join('\n\n')}`;

            // Always persist to web chat first.
            try {
                const activeSessionSetting = await db.select({
                    value: userSettings.value,
                }).from(userSettings)
                    .where(and(eq(userSettings.userId, uId), eq(userSettings.key, 'active_chat_session_id')))
                    .limit(1);

                const recentMessages = await db.select({
                    sessionId: messages.sessionId,
                }).from(messages)
                    .where(eq(messages.userId, uId))
                    .orderBy(desc(messages.createdAt))
                    .limit(50);

                const targetSessionIds: string[] = [];
                const pushSessionId = (sid?: string | null) => {
                    const normalized = sid?.trim();
                    if (!normalized) return;
                    if (targetSessionIds.includes(normalized)) return;
                    targetSessionIds.push(normalized);
                };

                // Prefer active session, then mirror to recent sessions to avoid "message written but not visible".
                pushSessionId(activeSessionSetting[0]?.value);
                for (const row of recentMessages) {
                    pushSessionId(row.sessionId);
                    if (targetSessionIds.length >= 5) break;
                }
                pushSessionId('default');
                if (targetSessionIds.length === 0) pushSessionId('default');

                await db.insert(messages).values(
                    targetSessionIds.map((sessionId) => ({
                        id: crypto.randomUUID(),
                        userId: uId,
                        sessionId,
                        content: notification,
                        source: 'system',
                        createdAt: Date.now(),
                    }))
                );
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
