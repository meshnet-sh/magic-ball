import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDb } from '@/db/index';
import { userSettings, users } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { executeAction, saveSystemMessage } from '@/lib/executeAction';

export async function POST(request: Request, context: { params: Promise<{ userId: string }> }) {
    try {
        const { env } = await getCloudflareContext();
        const db = getDb(env.DB);

        // n8n Webhook Auth Strategy: 
        // We expect the incoming webhook to provide the Admin's configured "token"
        // either via `Authorization: Bearer <token>` or `x-n8n-token: <token>` header.
        // If the admin did not set a token, we allow open access (though not recommended).

        const params = await context.params;
        const userIdFromPath = params.userId;
        const authHeader = request.headers.get('Authorization');
        const customHeader = request.headers.get('x-n8n-token');
        const providedToken = authHeader?.replace('Bearer ', '') || customHeader || null;

        // Primary resolution: userId in route
        let resolvedUser: any = null;
        let integrationsSetting: any = null;
        let n8nToken: string | null = null;

        if (userIdFromPath) {
            resolvedUser = await db.select().from(users).where(eq(users.id, userIdFromPath)).get();
            if (resolvedUser) {
                integrationsSetting = await db.select().from(userSettings)
                    .where(and(eq(userSettings.userId, userIdFromPath), eq(userSettings.key, "integrations")))
                    .get();
            }
        }

        // Fallback resolution: stale userId in URL, recover by token->user mapping
        if (!resolvedUser && providedToken) {
            const integrationRows = await db.select().from(userSettings).where(eq(userSettings.key, "integrations"));
            for (const row of integrationRows) {
                try {
                    const parsed = JSON.parse(row.value);
                    if (parsed?.n8n?.token && parsed.n8n.token === providedToken) {
                        const maybeUser = await db.select().from(users).where(eq(users.id, row.userId)).get();
                        if (maybeUser) {
                            resolvedUser = maybeUser;
                            integrationsSetting = row;
                            break;
                        }
                    }
                } catch {
                    // Ignore malformed integrations value
                }
            }
        }

        if (!resolvedUser) {
            return NextResponse.json({ success: false, error: 'Target user not found' }, { status: 404 });
        }

        if (integrationsSetting) {
            try {
                const parsed = JSON.parse(integrationsSetting.value);
                n8nToken = parsed?.n8n?.token || null;
            } catch {
                console.warn("[n8n-inbound] Invalid integrations JSON");
            }
        }

        // Validate token if one is configured
        if (n8nToken) {
            if (!providedToken || providedToken !== n8nToken) {
                console.warn(`[n8n-inbound] Auth failed. user=${resolvedUser.id}`);
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
            const result = await executeAction(db, resolvedUser.id, payload);

            // Explicitly save text output from external automation (like 'chat' actions) to the UI
            if (result.ok && payload.action === 'chat') {
                try {
                    await saveSystemMessage(db, resolvedUser.id, result.message, 'system');
                } catch (e) {
                    console.error("[n8n-inbound] saveSystemMessage failed:", e);
                }
            }

            return NextResponse.json({ success: result.ok, data: result.message });
        }

        // Default: If no direct command is given, log it as a fast idea / notification
        const contentStr = typeof payload === 'object' ? JSON.stringify(payload) : String(payload);
        const fallbackCmd = {
            action: 'create_idea',
            content: `【n8n 回调数据】\n${contentStr}`,
            tags: ['n8n', 'webhook']
        };
        const result = await executeAction(db, resolvedUser.id, fallbackCmd);

        return NextResponse.json({ success: true, received: true, fallbackResult: result.message });
    } catch (error: any) {
        console.error("[n8n-inbound] Error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
