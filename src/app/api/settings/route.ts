import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDb } from '@/db/index';
import { userSettings } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

function getUserIdFromCookie(request: Request) {
    const cookieHeader = request.headers.get('cookie') || "";
    const match = cookieHeader.match(/auth_session=([^;]+)/);
    return match ? match[1] : null;
}

// GET: Fetch all settings for the current user
export async function GET(request: Request) {
    try {
        const userId = getUserIdFromCookie(request);
        if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const { env } = await getCloudflareContext();
        const db = getDb(env.DB);

        const settings = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
        const settingsMap: Record<string, string> = {};
        settings.forEach(s => { settingsMap[s.key] = s.value; });

        return NextResponse.json({ success: true, data: settingsMap });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

// POST: Save a setting (upsert)
export async function POST(request: Request) {
    try {
        const userId = getUserIdFromCookie(request);
        if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const { env } = await getCloudflareContext();
        const db = getDb(env.DB);
        const body: any = await request.json();

        if (!body.key || body.value === undefined) {
            return NextResponse.json({ success: false, error: 'Missing key or value' }, { status: 400 });
        }

        // Check if setting exists
        const existing = await db.select().from(userSettings)
            .where(and(eq(userSettings.userId, userId), eq(userSettings.key, body.key)))
            .get();

        if (existing) {
            await db.update(userSettings)
                .set({ value: body.value })
                .where(eq(userSettings.id, existing.id));
        } else {
            await db.insert(userSettings).values({
                id: crypto.randomUUID(),
                userId,
                key: body.key,
                value: body.value
            });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
