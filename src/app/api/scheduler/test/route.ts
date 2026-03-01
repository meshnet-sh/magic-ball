import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDb } from '@/db/index';
import { scheduledTasks } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { getVerifiedUserIdFromCookie } from '@/lib/auth';

export async function POST(request: Request) {
    try {
        const userId = await getVerifiedUserIdFromCookie(request);
        if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const body: any = await request.json().catch(() => ({}));
        const taskId = String(body?.taskId || '').trim();
        if (!taskId) {
            return NextResponse.json({ success: false, error: 'Missing taskId' }, { status: 400 });
        }

        const { env } = await getCloudflareContext();
        const db = getDb(env.DB);

        const task = await db.select().from(scheduledTasks)
            .where(and(eq(scheduledTasks.id, taskId), eq(scheduledTasks.userId, userId)))
            .get();
        if (!task) {
            return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 });
        }

        let actionCmd: any;
        try {
            const payload = JSON.parse(task.actionPayload);
            if (payload.action) {
                actionCmd = payload;
            } else if (task.actionType === 'ai_prompt') {
                actionCmd = { action: 'ai_agent', prompt: payload.prompt };
            } else {
                actionCmd = { action: task.actionType, ...payload };
            }
        } catch {
            actionCmd = { action: task.actionType };
        }

        const { executeAction } = await import('@/lib/executeAction');
        const result = await executeAction(db, userId, actionCmd);

        return NextResponse.json({ success: true, ok: result.ok, message: result.message });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
