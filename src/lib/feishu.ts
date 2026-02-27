// Feishu (Lark) API utilities

const FEISHU_APP_ID = 'cli_a92bd1e2eab81bc9';
const FEISHU_APP_SECRET = 'Iw3L1fGWrPfHnfz3zJi0ugNaYSNFSc88';

let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Get tenant_access_token from Feishu API
 */
export async function getAccessToken(): Promise<string> {
    // Return cached token if still valid
    if (cachedToken && Date.now() < cachedToken.expiresAt) {
        return cachedToken.token;
    }

    const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            app_id: FEISHU_APP_ID,
            app_secret: FEISHU_APP_SECRET,
        }),
    });

    const data: any = await res.json();
    if (data.code !== 0) {
        throw new Error(`Failed to get Feishu access token: ${data.msg}`);
    }

    cachedToken = {
        token: data.tenant_access_token,
        expiresAt: Date.now() + (data.expire - 60) * 1000, // refresh 60s before expiry
    };

    return cachedToken.token;
}

/**
 * Reply to a message in Feishu
 */
export async function replyMessage(messageId: string, text: string): Promise<void> {
    const token = await getAccessToken();
    const res = await fetch(`https://open.feishu.cn/open-apis/im/v1/messages/${messageId}/reply`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
            content: JSON.stringify({ text }),
            msg_type: 'text',
        }),
    });
    const data: any = await res.json();
    if (data.code !== 0) {
        console.error('Feishu reply error:', data);
    }
}

/**
 * Send a message to a chat
 */
export async function sendMessage(chatId: string, text: string): Promise<void> {
    const token = await getAccessToken();
    await fetch(`https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
            receive_id: chatId,
            content: JSON.stringify({ text }),
            msg_type: 'text',
        }),
    });
}
