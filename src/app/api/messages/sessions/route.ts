import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDb } from '@/db/index';
import { messages } from '@/db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { getVerifiedUserIdFromCookie } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
    try {
        const userId = await getVerifiedUserIdFromCookie(request);
        if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const { env } = await getCloudflareContext();
        const db = getDb(env.DB);

        // Pull all messages (latest first) and keep the first row per session.
        // This is deterministic and avoids brittle SQLite GROUP BY/HAVING behavior.
        const rows = await db.select({
            sessionId: messages.sessionId,
            lastContent: messages.content,
            createdAt: messages.createdAt,
            id: messages.id,
        }).from(messages)
            .where(eq(messages.userId, userId))
            .orderBy(desc(messages.createdAt), desc(messages.id));

        const seen = new Set<string>();
        const sessionsList: Array<{ sessionId: string; lastContent: string; createdAt: number }> = [];

        for (const row of rows) {
            if (seen.has(row.sessionId)) continue;
            seen.add(row.sessionId);
            sessionsList.push({
                sessionId: row.sessionId,
                lastContent: row.lastContent,
                createdAt: row.createdAt,
            });
        }

        return NextResponse.json(
            { success: true, data: sessionsList },
            { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
        );
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const userId = await getVerifiedUserIdFromCookie(request);
        if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const url = new URL(request.url);
        const sessionId = url.searchParams.get('sessionId');

        if (!sessionId) {
            return NextResponse.json({ success: false, error: 'Session ID is required' }, { status: 400 });
        }

        const { env } = await getCloudflareContext();
        const db = getDb(env.DB);

        // Delete all messages belonging to this session for the current user
        await db.delete(messages)
            .where(and(eq(messages.userId, userId), eq(messages.sessionId, sessionId)));

        return NextResponse.json({ success: true, message: 'Session deleted successfully' });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
