import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDb } from '@/db/index';
import { messages, userSettings } from '@/db/schema';
import { eq, desc, and } from 'drizzle-orm';

function getUserIdFromCookie(request: Request) {
    const cookieHeader = request.headers.get('cookie') || "";
    const match = cookieHeader.match(/auth_session=([^;]+)/);
    return match ? match[1] : null;
}

// GET: Fetch recent messages for the current user
export async function GET(request: Request) {
    try {
        const userId = getUserIdFromCookie(request);
        if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const { env } = await getCloudflareContext();
        const db = getDb(env.DB);

        const recentMessages = await db.select().from(messages)
            .where(eq(messages.userId, userId))
            .orderBy(desc(messages.createdAt))
            .limit(50);

        return NextResponse.json({ success: true, data: recentMessages.reverse() });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

// POST: Save a new message
export async function POST(request: Request) {
    try {
        const userId = getUserIdFromCookie(request);
        if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const { env } = await getCloudflareContext();
        const db = getDb(env.DB);
        const body: any = await request.json();

        // Save multiple messages at once if provided as an array
        const msgs = Array.isArray(body) ? body : [body];

        await Promise.all(msgs.map(m =>
            db.insert(messages).values({
                id: crypto.randomUUID(),
                userId,
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
