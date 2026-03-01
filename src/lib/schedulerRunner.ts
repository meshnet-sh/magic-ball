import { executeAction } from '@/lib/executeAction';

type ScheduledTaskLike = {
    id: string;
    userId: string;
    title: string;
    triggerAt: number;
    recurrence: string | null;
    actionType: string;
    actionPayload: string;
};

export function computeNextTrigger(recurrence: string | null, currentTrigger: number): number | null {
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

export function parseScheduledTaskAction(task: ScheduledTaskLike): any {
    try {
        const payload = JSON.parse(task.actionPayload);
        if (payload.action) return payload;
        if (task.actionType === 'ai_prompt') {
            return { action: 'ai_agent', prompt: payload.prompt };
        }
        return { action: task.actionType, ...payload };
    } catch {
        return { action: task.actionType };
    }
}

export async function claimAndAdvanceScheduledTask(
    envDb: any,
    task: ScheduledTaskLike,
    now: number
): Promise<boolean> {
    const nextTrigger = computeNextTrigger(task.recurrence, task.triggerAt);
    if (nextTrigger) {
        const r = await envDb.prepare(
            `UPDATE scheduled_tasks
             SET last_triggered = ?, trigger_at = ?
             WHERE id = ? AND status = 'active' AND trigger_at = ?`
        ).bind(now, nextTrigger, task.id, task.triggerAt).run();
        return Number((r as any)?.meta?.changes || 0) > 0;
    }

    const r = await envDb.prepare(
        `UPDATE scheduled_tasks
         SET last_triggered = ?, status = 'completed'
         WHERE id = ? AND status = 'active' AND trigger_at = ?`
    ).bind(now, task.id, task.triggerAt).run();
    return Number((r as any)?.meta?.changes || 0) > 0;
}

export async function runClaimedScheduledTask(db: any, userId: string, task: ScheduledTaskLike) {
    const actionCmd = parseScheduledTaskAction(task);
    return executeAction(db, userId, actionCmd);
}

