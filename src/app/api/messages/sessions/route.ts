import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDb } from '@/db/index';
import { messages } from '@/db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { getVerifiedUserIdFromCookie } from '@/lib/auth';

export async function GET(request: Request) {
    try {
        const userId = await getVerifiedUserIdFromCookie(request);
        if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const { env } = await getCloudflareContext();
        const db = getDb(env.DB);

        // Fetch unique session IDs for the user with the latest message and timestamp
        // SQLite query to get latest message per session
        const sessionsList = await db.select({
            sessionId: messages.sessionId,
            lastContent: messages.content,
            createdAt: messages.createdAt,
        }).from(messages)
            .where(eq(messages.userId, userId))
            .groupBy(messages.sessionId)
            .orderBy(desc(messages.createdAt));

        return NextResponse.json({ success: true, data: sessionsList });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
