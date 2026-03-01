import { getDb } from '@/db/index';
import { userSettings, users } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export async function triggerN8nWorkflow(db: ReturnType<typeof getDb>, userId: string, eventName: string, payload: any = {}) {
    // 1. Load user-specific integrations config
    const integrationsSetting = await db.select().from(userSettings)
        .where(and(eq(userSettings.userId, userId), eq(userSettings.key, "integrations")))
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

    // Event allowlist guard: default to email only, unless explicitly extended in integrations.n8n.allowedEvents.
    const allowedEvents = Array.isArray(n8nConfig.allowedEvents) && n8nConfig.allowedEvents.length > 0
        ? n8nConfig.allowedEvents.map((e: any) => String(e))
        : ['send_email'];
    if (!allowedEvents.includes(eventName)) {
        throw new Error(`n8n event '${eventName}' is not allowed. Allowed events: ${allowedEvents.join(', ')}`);
    }

    // Fill default email recipient when users ask to send email without explicit `to`.
    let normalizedPayload = payload;
    if (eventName === 'send_email') {
        const p: any = (payload && typeof payload === 'object') ? { ...payload } : {};
        const hasRecipient = typeof p.to === 'string' && p.to.trim().length > 0;
        if (!hasRecipient) {
            const recipientSetting = await db.select().from(userSettings)
                .where(and(eq(userSettings.userId, userId), eq(userSettings.key, 'default_email_recipient')))
                .get();
            const configuredRecipient = recipientSetting?.value?.trim();

            if (configuredRecipient) {
                p.to = configuredRecipient;
            } else {
                const user = await db.select().from(users).where(eq(users.id, userId)).get();
                if (user?.email) p.to = user.email;
            }
        }
        normalizedPayload = p;
    }

    // 3. Prepare Request payload
    const finalPayload = {
        event: eventName,
        source: "magic-ball",
        timestamp: new Date().toISOString(),
        data: normalizedPayload
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

    const text = await response.text();
    if (!text || text.trim().length === 0) {
        return { success: true };
    }

    try {
        return JSON.parse(text);
    } catch {
        return { success: true, message: text, raw: text };
    }
}
