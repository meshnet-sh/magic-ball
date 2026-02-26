import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDb } from '@/db/index';
import { ideas, users } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

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

        // Check if user is the admin
        const currentUser = await db.select().from(users).where(eq(users.id, userId)).get();
        if (!currentUser || currentUser.email !== 'meshnet@163.com') {
            return NextResponse.json({ success: false, error: 'Forbidden. Admin access required.' }, { status: 403 });
        }

        // Fetch all ideas joined with user email
        const allIdeas = await db.select({
            id: ideas.id,
            content: ideas.content,
            type: ideas.type,
            createdAt: ideas.createdAt,
            tags: ideas.tags,
            userEmail: users.email
        }).from(ideas)
            .leftJoin(users, eq(ideas.userId, users.id))
            .orderBy(desc(ideas.createdAt));

        const formattedIdeas = allIdeas.map(idea => ({
            ...idea,
            tags: idea.tags ? JSON.parse(idea.tags) : []
        }));

        return NextResponse.json({ success: true, data: formattedIdeas });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
