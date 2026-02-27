const SECRET_KEY = "mb-super-secret-key-2026";

async function getKey(): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    return await crypto.subtle.importKey(
        "raw",
        encoder.encode(SECRET_KEY),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign", "verify"]
    );
}

function bufferToHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

async function hexToBuffer(hex: string): Promise<ArrayBuffer> {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes.buffer;
}

/**
 * Signs a raw UUID and returns `UUID.SIGNATURE`
 */
export async function signUserId(userId: string): Promise<string> {
    const key = await getKey();
    const encoder = new TextEncoder();
    const signatureBuffer = await crypto.subtle.sign(
        "HMAC",
        key,
        encoder.encode(userId)
    );
    const signatureHex = bufferToHex(signatureBuffer);
    return `${userId}.${signatureHex}`;
}

/**
 * Verifies a signed `UUID.SIGNATURE` payload and returns the original UUID if valid.
 */
export async function verifyAndExtractUserId(signedPayload: string): Promise<string | null> {
    if (!signedPayload || typeof signedPayload !== 'string') return null;

    const parts = signedPayload.split('.');
    if (parts.length !== 2) return null;

    const [userId, signatureHex] = parts;
    const key = await getKey();
    const encoder = new TextEncoder();

    try {
        const signatureBuffer = await hexToBuffer(signatureHex);
        const isValid = await crypto.subtle.verify(
            "HMAC",
            key,
            signatureBuffer,
            encoder.encode(userId)
        );
        return isValid ? userId : null;
    } catch (e) {
        return null;
    }
}

/**
 * Convenience wrapper for API routes
 */
export async function getVerifiedUserIdFromCookie(request: Request): Promise<string | null> {
    const cookieHeader = request.headers.get('cookie') || "";
    const match = cookieHeader.match(/auth_session=([^;]+)/);
    if (!match) return null;

    return await verifyAndExtractUserId(match[1]);
}
