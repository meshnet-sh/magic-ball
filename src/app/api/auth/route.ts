import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDb } from '@/db/index';
import { users, userSettings } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
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
        const { email, password, action = 'login', inviteCode } = (await request.json()) as any;

        if (!email || !password) {
            return NextResponse.json({ success: false, error: 'Email and password required' }, { status: 400 });
        }

        let user = await db.select().from(users).where(eq(users.email, email)).get();

        if (action === 'register') {
            if (user) {
                return NextResponse.json({ success: false, error: '该邮箱已被注册' }, { status: 400 });
            }
            if (inviteCode !== 'meshnet') {
                return NextResponse.json({ success: false, error: '邀请码无效，请正确填写' }, { status: 403 });
            }

            const id = crypto.randomUUID();
            const passwordHash = await hashPassword(password);
            await db.insert(users).values({ id, email, passwordHash });
            user = { id, email, passwordHash } as any;

        } else if (action === 'login') {
            if (!user) {
                return NextResponse.json({ success: false, error: '账号不存在，请先注册' }, { status: 404 });
            }

            // Check if password reset is flagged
            const resetFlag = await db.select().from(userSettings)
                .where(and(eq(userSettings.userId, user.id), eq(userSettings.key, 'needs_password_reset'))).get();

            if (resetFlag && resetFlag.value === 'true') {
                return NextResponse.json({ success: true, action_required: 'reset_password' });
            }

            const inputHash = await hashPassword(password);
            const isValid = inputHash === user.passwordHash;
            if (!isValid) {
                return NextResponse.json({ success: false, error: '密码错误' }, { status: 401 });
            }

        } else if (action === 'reset') {
            if (!user) {
                return NextResponse.json({ success: false, error: '账号不存在' }, { status: 404 });
            }

            const resetFlag = await db.select().from(userSettings)
                .where(and(eq(userSettings.userId, user.id), eq(userSettings.key, 'needs_password_reset'))).get();

            if (!resetFlag || resetFlag.value !== 'true') {
                return NextResponse.json({ success: false, error: '无权重置密码' }, { status: 403 });
            }

            const newHash = await hashPassword(password);
            await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, user.id));
            await db.delete(userSettings)
                .where(and(eq(userSettings.userId, user.id), eq(userSettings.key, 'needs_password_reset')));

            user.passwordHash = newHash;

        } else {
            return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
        }

        const response = NextResponse.json({ success: true, user: { id: user!.id, email: user!.email } });

        const signedSession = await signUserId(user!.id);

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
            try {
                const { env } = await getCloudflareContext();
                const db = getDb(env.DB);
                const user = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).get();
                if (user) {
                    return NextResponse.json({ authenticated: true, userId });
                }
            } catch {
                // Fall through as unauthenticated on any lookup error.
            }
        }
    }
    return NextResponse.json({ authenticated: false });
}

export async function DELETE() {
    const response = NextResponse.json({ success: true });
    response.cookies.set('auth_session', '', {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 0 // Clear the cookie
    });
    return response;
}
