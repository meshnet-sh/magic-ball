import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDb } from '@/db/index';
import { polls, pollOptions, pollResponses } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

import { getVerifiedUserIdFromCookie } from '@/lib/auth';

// GET: Fetch poll results (AUTHENTICATED — creator only)
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const userId = await getVerifiedUserIdFromCookie(request);
        if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const { id } = await context.params;
        const { env } = await getCloudflareContext();
        const db = getDb(env.DB);

        // Verify poll ownership
        const poll = await db.select().from(polls)
            .where(and(eq(polls.id, id), eq(polls.userId, userId))).get();
        if (!poll) return NextResponse.json({ success: false, error: 'Not found or not authorized' }, { status: 404 });

        const options = await db.select().from(pollOptions)
            .where(eq(pollOptions.pollId, id))
            .orderBy(pollOptions.sortOrder);

        const responses = await db.select().from(pollResponses)
            .where(eq(pollResponses.pollId, id));

        if (poll.type === 'open_text') {
            return NextResponse.json({
                success: true,
                data: {
                    poll,
                    totalResponses: responses.length,
                    textResponses: responses.map(r => ({
                        content: r.textContent,
                        createdAt: r.createdAt
                    }))
                }
            });
        } else {
            // Calculate vote counts per option
            const optionResults = options.map(opt => ({
                id: opt.id,
                content: opt.content,
                votes: responses.filter(r => r.optionId === opt.id).length
            }));

            return NextResponse.json({
                success: true,
                data: {
                    poll,
                    totalResponses: new Set(responses.map(r => r.fingerprint)).size,
                    options: optionResults
                }
            });
        }
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
