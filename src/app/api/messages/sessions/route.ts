import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDb } from '@/db/index';
import { messages } from '@/db/schema';
import { eq, desc, sql, and } from 'drizzle-orm';
import { getVerifiedUserIdFromCookie } from '@/lib/auth';

export async function GET(request: Request) {
    try {
        const userId = await getVerifiedUserIdFromCookie(request);
        if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const { env } = await getCloudflareContext();
        const db = getDb(env.DB);

        // Fetch unique session IDs with latest message content and timestamp
        // SQLite trick: GROUP BY + HAVING MAX() picks the correct row
        const sessionsList = await db.select({
            sessionId: messages.sessionId,
            lastContent: messages.content,
            createdAt: messages.createdAt,
        }).from(messages)
            .where(and(
                eq(messages.userId, userId),
                sql`${messages.id} IN (SELECT ${messages.id} FROM ${messages} WHERE ${messages.userId} = ${userId} GROUP BY ${messages.sessionId} HAVING MAX(${messages.createdAt}))`
            ))
            .orderBy(desc(messages.createdAt));

        return NextResponse.json({ success: true, data: sessionsList });
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
