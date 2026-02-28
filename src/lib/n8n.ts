import { getDb } from '@/db/index';
import { userSettings, users } from '@/db/schema';
import { eq } from 'drizzle-orm';

const ADMIN_EMAIL = 'meshnet@163.com';

export async function triggerN8nWorkflow(db: ReturnType<typeof getDb>, eventName: string, payload: any = {}) {
    // 1. Get Admin User ID
    const adminUser = await db.select().from(users).where(eq(users.email, ADMIN_EMAIL)).get();
    if (!adminUser) {
        throw new Error("Admin user not found, cannot trigger n8n");
    }

    // 2. Load globally saved integrations config
    const integrationsSetting = await db.select().from(userSettings)
        .where(eq(userSettings.key, "integrations"))
        .get();

    if (!integrationsSetting) {
        throw new Error("No integrations configured");
    }

    let integrations;
    try {
        integrations = JSON.parse(integrationsSetting.value);
    } catch (e) {
        throw new Error("Invalid integrations config format");
    }

    const n8nConfig = integrations.n8n;
    if (!n8nConfig || !n8nConfig.url) {
        throw new Error("n8n webhook URL is not configured");
    }

    // 3. Prepare Request payload
    const finalPayload = {
        event: eventName,
        source: "magic-ball",
        timestamp: new Date().toISOString(),
        data: payload
    };

    const headers: Record<string, string> = {
        'Content-Type': 'application/json'
    };

    // Optional auth token
    if (n8nConfig.token) {
        headers['Authorization'] = `Bearer ${n8nConfig.token}`;
    }

    // 4. Fire Webhook
    console.log(`[n8n] Triggering webhook: ${n8nConfig.url} for event: ${eventName}`);
    const response = await fetch(n8nConfig.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(finalPayload)
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`n8n webhook failed (${response.status}): ${text}`);
    }

    return await response.json().catch(() => ({ success: true }));
}
