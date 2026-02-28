import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDb } from '@/db/index';
import { ideas, users, polls, pollOptions, pollResponses, userSettings } from '@/db/schema';
import { eq, desc, and } from 'drizzle-orm';

import { getVerifiedUserIdFromCookie } from '@/lib/auth';

export async function GET(request: Request) {
    try {
        const userId = await getVerifiedUserIdFromCookie(request);
        if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const { env } = await getCloudflareContext();
        const db = getDb(env.DB);

        // Check if user is admin
        const currentUser = await db.select().from(users).where(eq(users.id, userId)).get();
        if (!currentUser || currentUser.email !== 'meshnet@163.com') {
            return NextResponse.json({ success: false, error: 'Forbidden. Admin access required.' }, { status: 403 });
        }

        // Fetch all ideas with user email
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

        const formattedIdeas = allIdeas.map(idea => {
            let tags: string[] = [];
            try {
                if (Array.isArray(idea.tags)) tags = idea.tags;
                else if (typeof idea.tags === 'string' && idea.tags) {
                    const parsed = JSON.parse(idea.tags);
                    tags = Array.isArray(parsed) ? parsed : [];
                }
            } catch { tags = []; }
            return { ...idea, tags };
        });

        // Fetch all polls with response counts
        const allPolls = await db.select().from(polls).orderBy(desc(polls.createdAt));
        const pollsWithStats = await Promise.all(allPolls.map(async (poll) => {
            const options = await db.select().from(pollOptions).where(eq(pollOptions.pollId, poll.id));
            const responses = await db.select().from(pollResponses).where(eq(pollResponses.pollId, poll.id));
            const creator = await db.select().from(users).where(eq(users.id, poll.userId)).get();
            return {
                ...poll,
                userEmail: creator?.email || 'Unknown',
                optionCount: options.length,
                responseCount: responses.length
            };
        }));

        // Fetch all users
        const allUsers = await db.select({ id: users.id, email: users.email }).from(users);

        return NextResponse.json({
            success: true,
            data: {
                ideas: formattedIdeas,
                polls: pollsWithStats,
                users: allUsers
            }
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const userId = await getVerifiedUserIdFromCookie(request);
        if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const { env } = await getCloudflareContext();
        const db = getDb(env.DB);

        // Verify Admin
        const currentUser = await db.select().from(users).where(eq(users.id, userId)).get();
        if (!currentUser || currentUser.email !== 'meshnet@163.com') {
            return NextResponse.json({ success: false, error: 'Forbidden. Admin access required.' }, { status: 403 });
        }

        const { action, targetUserId } = await request.json() as any;

        if (action === 'FLAG_PASSWORD_RESET') {
            if (!targetUserId) {
                return NextResponse.json({ success: false, error: '缺少目标用户ID' }, { status: 400 });
            }

            // Upsert the needs_password_reset flag for the target user
            const existingFlag = await db.select().from(userSettings)
                .where(and(eq(userSettings.userId, targetUserId), eq(userSettings.key, 'needs_password_reset'))).get();

            if (existingFlag) {
                await db.update(userSettings).set({ value: 'true' })
                    .where(and(eq(userSettings.userId, targetUserId), eq(userSettings.key, 'needs_password_reset')));
            } else {
                await db.insert(userSettings).values({
                    id: crypto.randomUUID(),
                    userId: targetUserId,
                    key: 'needs_password_reset',
                    value: 'true'
                });
            }

            return NextResponse.json({ success: true, message: '已标记密码重置要求。下次登录将强制重置密码。' });
        }

        return NextResponse.json({ success: false, error: '未知的管理操作' }, { status: 400 });

    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
