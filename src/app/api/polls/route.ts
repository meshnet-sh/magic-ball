import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDb } from '@/db/index';
import { polls, pollOptions, pollResponses } from '@/db/schema';
import { eq, desc, and } from 'drizzle-orm';

import { getVerifiedUserIdFromCookie } from '@/lib/auth';

// GET: List all polls created by the current user
export async function GET(request: Request) {
    try {
        const userId = await getVerifiedUserIdFromCookie(request);
        if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const { env } = await getCloudflareContext();
        const db = getDb(env.DB);

        const userPolls = await db.select().from(polls)
            .where(eq(polls.userId, userId))
            .orderBy(desc(polls.createdAt));

        // For each poll, also fetch options count and response count
        const pollsWithStats = await Promise.all(userPolls.map(async (poll) => {
            const options = await db.select().from(pollOptions)
                .where(eq(pollOptions.pollId, poll.id))
                .orderBy(pollOptions.sortOrder);
            const responses = await db.select().from(pollResponses)
                .where(eq(pollResponses.pollId, poll.id));
            return {
                ...poll,
                options,
                responseCount: responses.length
            };
        }));

        return NextResponse.json({ success: true, data: pollsWithStats });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

// POST: Create a new poll
export async function POST(request: Request) {
    try {
        const userId = await getVerifiedUserIdFromCookie(request);
        if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const { env } = await getCloudflareContext();
        const db = getDb(env.DB);
        const body: any = await request.json();

        const pollId = crypto.randomUUID();

        await db.insert(polls).values({
            id: pollId,
            userId,
            title: body.title,
            description: body.description || null,
            type: body.type,
            accessCode: body.accessCode || null,
            isActive: true,
            createdAt: Date.now()
        });

        // Insert options (for choice types)
        if (body.options && body.options.length > 0) {
            await Promise.all(body.options.map((opt: string, idx: number) =>
                db.insert(pollOptions).values({
                    id: crypto.randomUUID(),
                    pollId,
                    content: opt,
                    sortOrder: idx
                })
            ));
        }

        return NextResponse.json({ success: true, id: pollId });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

// DELETE: Delete a poll and its options/responses
export async function DELETE(request: Request) {
    try {
        const userId = await getVerifiedUserIdFromCookie(request);
        if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const { env } = await getCloudflareContext();
        const db = getDb(env.DB);
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) return NextResponse.json({ success: false, error: 'Missing id' }, { status: 400 });

        // Verify ownership
        const pollResults = await db.select().from(polls).where(and(eq(polls.id, id), eq(polls.userId, userId)));
        const poll = pollResults[0];
        if (!poll) return NextResponse.json({ success: false, error: 'Not found or not authorized' }, { status: 404 });

        // Delete via batch to avoid hanging promises and for atomicity
        await db.batch([
            db.delete(pollResponses).where(eq(pollResponses.pollId, id)),
            db.delete(pollOptions).where(eq(pollOptions.pollId, id)),
            db.delete(polls).where(eq(polls.id, id))
        ]);

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Poll delete error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

// PATCH: Toggle poll active status
export async function PATCH(request: Request) {
    try {
        const userId = await getVerifiedUserIdFromCookie(request);
        if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const { env } = await getCloudflareContext();
        const db = getDb(env.DB);
        const body: any = await request.json();

        const pollResults = await db.select().from(polls).where(and(eq(polls.id, body.id), eq(polls.userId, userId)));
        const poll = pollResults[0];
        if (!poll) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

        await db.update(polls).set({ isActive: !poll.isActive }).where(eq(polls.id, body.id));

        return NextResponse.json({ success: true, isActive: !poll.isActive });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
