import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDb } from '@/db/index';
import { messages, userSettings, users } from '@/db/schema';
import { eq, desc, and } from 'drizzle-orm';

import { getVerifiedUserIdFromCookie } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET: Fetch recent messages for the current user (filter by sessionId if provided)
export async function GET(request: Request) {
    try {
        const userId = await getVerifiedUserIdFromCookie(request);
        if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const url = new URL(request.url);
        const sessionId = url.searchParams.get('sessionId') || 'default';

        const { env } = await getCloudflareContext();
        const db = getDb(env.DB);

        const recentMessages = await db.select().from(messages)
            .where(and(eq(messages.userId, userId), eq(messages.sessionId, sessionId)))
            .orderBy(desc(messages.createdAt))
            .limit(50);

        return NextResponse.json(
            { success: true, data: recentMessages.reverse() },
            { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
        );
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

// POST: Save a new message
export async function POST(request: Request) {
    try {
        const userId = await getVerifiedUserIdFromCookie(request);
        if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const { env } = await getCloudflareContext();
        const db = getDb(env.DB);
        const body: any = await request.json();
        const user = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).get();
        if (!user) {
            return NextResponse.json({ success: false, error: 'Session invalid: user not found, please login again' }, { status: 401 });
        }

        // Save multiple messages at once if provided as an array
        const msgs = Array.isArray(body) ? body : [body];

        await Promise.all(msgs.map(m =>
            db.insert(messages).values({
                id: crypto.randomUUID(),
                userId,
                sessionId: m.sessionId || 'default',
                content: m.content || m.text,
                source: m.source || (m.role === 'user' ? 'user' : 'system'),
                createdAt: m.createdAt || Date.now(),
            })
        ));

        // Forward AI/System messages to Feishu if configured
        const aiMsgs = msgs.filter(m => (m.source || (m.role === 'user' ? 'user' : 'system')) !== 'user');
        if (aiMsgs.length > 0) {
            try {
                const feishuSetting = await db.select().from(userSettings)
                    .where(and(eq(userSettings.userId, userId), eq(userSettings.key, 'feishu_open_id')));
                if (feishuSetting.length > 0) {
                    const { getAccessToken } = await import('@/lib/feishu');
                    const token = await getAccessToken();
                    const notification = aiMsgs.map(m => m.content || m.text).join('\n\n');
                    await fetch('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({
                            receive_id: feishuSetting[0].value,
                            content: JSON.stringify({ text: `[Web 同步]\n${notification}` }),
                            msg_type: 'text',
                        }),
                    });
                }
            } catch { }
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
// DELETE: Clear all messages for the current user
export async function DELETE(request: Request) {
    try {
        const userId = await getVerifiedUserIdFromCookie(request);
        if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const { env } = await getCloudflareContext();
        const db = getDb(env.DB);

        const url = new URL(request.url);
        const sessionId = url.searchParams.get('sessionId');

        if (sessionId) {
            await db.delete(messages).where(and(eq(messages.userId, userId), eq(messages.sessionId, sessionId)));
        } else {
            // Unsafe to delete all normally, but matching original behavior for backwards compat
            await db.delete(messages).where(eq(messages.userId, userId));
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
