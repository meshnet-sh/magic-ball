import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDb } from '@/db/index';
import { userSettings, users } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

import { getVerifiedUserIdFromCookie } from '@/lib/auth';

const ADMIN_EMAIL = 'meshnet@163.com';

// Keys that are global to the entire system
const isGlobalSystemKey = (key: string) => key.endsWith('_api_key') || key.endsWith('_secret');

// GET: Fetch all settings for the current user
export async function GET(request: Request) {
    try {
        const userId = await getVerifiedUserIdFromCookie(request);
        if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const { env } = await getCloudflareContext();
        const db = getDb(env.DB);

        const user = await db.select().from(users).where(eq(users.id, userId)).get();
        if (!user) return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });

        const isAdmin = user.email.toLowerCase() === ADMIN_EMAIL;

        // For non-admins, we load their personal settings (like feishu_open_id, gemini_model)
        // Global keys are stripped out if they somehow got in
        const settings = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
        const settingsMap: Record<string, string> = {};

        settings.forEach(s => {
            if (isAdmin || !isGlobalSystemKey(s.key)) {
                settingsMap[s.key] = s.value;
            }
        });

        // Admin needs to see all.
        // If non-admin needs global settings like 'system_model' we would fetch it from Admin's row here, 
        // but currently we handle API key lookup dynamically in the execution phase.

        return NextResponse.json({ success: true, data: settingsMap, isAdmin, userId });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

// POST: Save a setting (upsert)
export async function POST(request: Request) {
    try {
        const userId = await getVerifiedUserIdFromCookie(request);
        if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const { env } = await getCloudflareContext();
        const db = getDb(env.DB);
        const body: any = await request.json();

        if (!body.key || body.value === undefined) {
            return NextResponse.json({ success: false, error: 'Missing key or value' }, { status: 400 });
        }

        const user = await db.select().from(users).where(eq(users.id, userId)).get();
        const isAdmin = user?.email.toLowerCase() === ADMIN_EMAIL;

        if (isGlobalSystemKey(body.key) && !isAdmin) {
            return NextResponse.json({ success: false, error: 'Only administrators can modify system-wide API keys.' }, { status: 403 });
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
