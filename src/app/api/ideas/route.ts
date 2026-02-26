import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDb } from '@/db/index';
import { ideas } from '@/db/schema';
import { eq, desc, and } from 'drizzle-orm';

function getUserIdFromCookie(request: Request) {
    const cookieHeader = request.headers.get('cookie') || "";
    const match = cookieHeader.match(/auth_session=([^;]+)/);
    return match ? match[1] : null;
}

export async function GET(request: Request) {
    try {
        const userId = getUserIdFromCookie(request);
        if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const { env } = await getCloudflareContext();
        const db = getDb(env.DB);

        const userIdeas = await db.select().from(ideas).where(eq(ideas.userId, userId)).orderBy(desc(ideas.createdAt));

        const formattedIdeas = userIdeas.map(idea => ({
            ...idea,
            tags: idea.tags ? JSON.parse(idea.tags) : []
        }));

        return NextResponse.json({ success: true, data: formattedIdeas });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const userId = getUserIdFromCookie(request);
        if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const { env } = await getCloudflareContext();
        const db = getDb(env.DB);
        const body: any = await request.json();

        await db.insert(ideas).values({
            id: body.id,
            userId,
            type: body.type,
            content: body.content,
            tags: body.tags ? JSON.stringify(body.tags) : '[]',
            createdAt: body.createdAt || Date.now()
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const userId = getUserIdFromCookie(request);
        if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const { env } = await getCloudflareContext();
        const db = getDb(env.DB);
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) return NextResponse.json({ success: false, error: 'Missing id' }, { status: 400 });

        await db.delete(ideas).where(and(eq(ideas.id, id), eq(ideas.userId, userId)));

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
