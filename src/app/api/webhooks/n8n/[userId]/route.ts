import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDb } from '@/db/index';
import { userSettings, users } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { executeAction } from '@/lib/executeAction';

export async function POST(request: Request, context: { params: Promise<{ userId: string }> }) {
    try {
        const { env } = await getCloudflareContext();
        const db = getDb(env.DB);

        // n8n Webhook Auth Strategy: 
        // We expect the incoming webhook to provide the Admin's configured "token"
        // either via `Authorization: Bearer <token>` or `x-n8n-token: <token>` header.
        // If the admin did not set a token, we allow open access (though not recommended).

        const params = await context.params;
        const userId = params.userId;
        if (!userId) {
            return NextResponse.json({ success: false, error: 'User ID is missing from route' }, { status: 400 });
        }

        const targetUser = await db.select().from(users).where(eq(users.id, userId)).get();
        if (!targetUser) {
            return NextResponse.json({ success: false, error: 'Target user not found' }, { status: 404 });
        }

        const integrationsSetting = await db.select().from(userSettings)
            .where(and(eq(userSettings.userId, userId), eq(userSettings.key, "integrations")))
            .get();

        let n8nToken = null;
        if (integrationsSetting) {
            try {
                const parsed = JSON.parse(integrationsSetting.value);
                n8nToken = parsed?.n8n?.token;
            } catch (e) {
                console.warn("[n8n-inbound] Invalid integrations JSON");
            }
        }

        // Validate token if one is configured
        if (n8nToken) {
            const authHeader = request.headers.get('Authorization');
            const customHeader = request.headers.get('x-n8n-token');
            const providedToken = authHeader?.replace('Bearer ', '') || customHeader;

            if (!providedToken || providedToken !== n8nToken) {
                console.warn(`[n8n-inbound] Auth failed. Expected: ${n8nToken}, Got: ${providedToken}`);
                return NextResponse.json({ success: false, error: 'Unauthorized n8n webhook' }, { status: 401 });
            }
        }

        // Parse payload
        let payload;
        try {
            payload = await request.json();
        } catch (e) {
            return NextResponse.json({ success: false, error: 'Invalid JSON payload' }, { status: 400 });
        }

        console.log("[n8n-inbound] Received Webhook Payload:", JSON.stringify(payload).substring(0, 200) + '...');

        // Processing: We allow the inbound webhook to trigger our core `executeAction` Engine !
        // For example, `{ "action": "create_idea", "content": "Scraped data..." }`
        if (payload && payload.action) {
            const result = await executeAction(db, targetUser.id, payload);
            return NextResponse.json({ success: result.ok, data: result.message });
        }

        // Default: If no direct command is given, log it as a fast idea / notification
        const contentStr = typeof payload === 'object' ? JSON.stringify(payload) : String(payload);
        const fallbackCmd = {
            action: 'create_idea',
            content: `【n8n 回调数据】\n${contentStr}`,
            tags: ['n8n', 'webhook']
        };
        const result = await executeAction(db, targetUser.id, fallbackCmd);

        return NextResponse.json({ success: true, received: true, fallbackResult: result.message });
    } catch (error: any) {
        console.error("[n8n-inbound] Error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
