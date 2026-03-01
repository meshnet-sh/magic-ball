import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDb } from '@/db/index';
import { messages } from '@/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { getVerifiedUserIdFromCookie } from '@/lib/auth';
import { SYSTEM_SESSION_ID } from '@/lib/messageChannels';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
    try {
        const userId = await getVerifiedUserIdFromCookie(request);
        if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const { env } = await getCloudflareContext();
        const db = getDb(env.DB);

        const rows = await db.select().from(messages)
            .where(and(eq(messages.userId, userId), eq(messages.sessionId, SYSTEM_SESSION_ID)))
            .orderBy(desc(messages.createdAt))
            .limit(100);

        return NextResponse.json(
            { success: true, data: rows.reverse() },
            { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
        );
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

