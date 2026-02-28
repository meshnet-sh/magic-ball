import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDb } from '@/db/index';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { signUserId, verifyAndExtractUserId } from '@/lib/auth';

async function hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + "my_salt_123");
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function POST(request: Request) {
    try {
        const { env } = await getCloudflareContext();
        const db = getDb(env.DB);
        const { email, password } = (await request.json()) as any;

        if (!email || !password) {
            return NextResponse.json({ success: false, error: 'Email and password required' }, { status: 400 });
        }

        let user = await db.select().from(users).where(eq(users.email, email)).get();

        if (user) {
            const inputHash = await hashPassword(password);
            const isValid = inputHash === user.passwordHash;
            if (!isValid) {
                return NextResponse.json({ success: false, error: '密码错误' }, { status: 401 });
            }
        } else {
            // Open Registration: Allow any new email to register
            const id = crypto.randomUUID();
            const passwordHash = await hashPassword(password);

            await db.insert(users).values({ id, email, passwordHash });
            user = { id, email, passwordHash };
        }

        const response = NextResponse.json({ success: true, user: { id: user.id, email: user.email } });

        const signedSession = await signUserId(user.id);

        response.cookies.set('auth_session', signedSession, {
            httpOnly: true,
            secure: true,
            sameSite: 'lax',
            path: '/',
            maxAge: 60 * 60 * 24 * 30
        });

        return response;
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function GET(request: Request) {
    const sessionCookie = request.headers.get('cookie')?.split('auth_session=')?.[1]?.split(';')?.[0];
    if (sessionCookie) {
        const userId = await verifyAndExtractUserId(sessionCookie);
        if (userId) {
            return NextResponse.json({ authenticated: true, userId });
        }
    }
    return NextResponse.json({ authenticated: false });
}
