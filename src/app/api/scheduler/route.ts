import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDb } from '@/db/index';
import { scheduledTasks } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';

function getUserIdFromCookie(request: Request) {
    const cookieHeader = request.headers.get('cookie') || "";
    const match = cookieHeader.match(/auth_session=([^;]+)/);
    return match ? match[1] : null;
}

// GET — list tasks
export async function GET(request: Request) {
    try {
        const userId = getUserIdFromCookie(request);
        if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const { env } = await getCloudflareContext();
        const db = getDb(env.DB);

        const url = new URL(request.url);
        const status = url.searchParams.get('status');

        let tasks;
        if (status) {
            tasks = await db.select().from(scheduledTasks)
                .where(and(eq(scheduledTasks.userId, userId), eq(scheduledTasks.status, status)))
                .orderBy(desc(scheduledTasks.triggerAt));
        } else {
            tasks = await db.select().from(scheduledTasks)
                .where(eq(scheduledTasks.userId, userId))
                .orderBy(desc(scheduledTasks.triggerAt));
        }

        return NextResponse.json({ success: true, data: tasks });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

// POST — create task
export async function POST(request: Request) {
    try {
        const userId = getUserIdFromCookie(request);
        if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const { env } = await getCloudflareContext();
        const db = getDb(env.DB);
        const body: any = await request.json();

        const id = crypto.randomUUID();
        const now = Date.now();

        await db.insert(scheduledTasks).values({
            id,
            userId,
            title: body.title,
            triggerAt: body.triggerAt,
            recurrence: body.recurrence || null,
            actionType: body.actionType,
            actionPayload: typeof body.actionPayload === 'string' ? body.actionPayload : JSON.stringify(body.actionPayload || {}),
            status: 'active',
            createdAt: now,
        });

        return NextResponse.json({ success: true, id });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

// PATCH — update task status or fields
export async function PATCH(request: Request) {
    try {
        const userId = getUserIdFromCookie(request);
        if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const { env } = await getCloudflareContext();
        const db = getDb(env.DB);
        const body: any = await request.json();

        if (!body.id) return NextResponse.json({ success: false, error: 'Missing task id' }, { status: 400 });

        // Build update object
        const updates: any = {};
        if (body.status !== undefined) updates.status = body.status;
        if (body.title !== undefined) updates.title = body.title;
        if (body.triggerAt !== undefined) updates.triggerAt = body.triggerAt;
        if (body.recurrence !== undefined) updates.recurrence = body.recurrence;

        await db.update(scheduledTasks)
            .set(updates)
            .where(and(eq(scheduledTasks.id, body.id), eq(scheduledTasks.userId, userId)));

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

// DELETE — remove task
export async function DELETE(request: Request) {
    try {
        const userId = getUserIdFromCookie(request);
        if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const url = new URL(request.url);
        const id = url.searchParams.get('id');
        if (!id) return NextResponse.json({ success: false, error: 'Missing task id' }, { status: 400 });

        const { env } = await getCloudflareContext();
        const db = getDb(env.DB);

        await db.delete(scheduledTasks)
            .where(and(eq(scheduledTasks.id, id), eq(scheduledTasks.userId, userId)));

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
