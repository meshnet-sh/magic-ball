import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDb } from '@/db/index';
import { scheduledTasks, userSettings, users } from '@/db/schema';
import { eq, and, lte } from 'drizzle-orm';

import { getVerifiedUserIdFromCookie } from '@/lib/auth';
import { claimAndAdvanceScheduledTask, runClaimedScheduledTask } from '@/lib/schedulerRunner';

// POST — check & execute all due tasks for the current user
export async function POST(request: Request) {
    try {
        const userId = await getVerifiedUserIdFromCookie(request);
        if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const { env } = await getCloudflareContext();
        const db = getDb(env.DB);
        const now = Date.now();
        const user = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).get();
        if (!user) {
            return NextResponse.json({ success: false, error: 'Session invalid: user not found, please login again' }, { status: 401 });
        }

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

        const { getAccessToken } = await import('@/lib/feishu');

        for (const task of dueTasks) {
            const claimed = await claimAndAdvanceScheduledTask(env.DB, task, now);
            if (!claimed) continue;

            const result = await runClaimedScheduledTask(db, userId, task);

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
