import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getDb } from '@/db/index';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';

export const runtime = 'edge';

export async function POST(request: Request) {
    try {
        const { env } = getRequestContext();
        const db = getDb(env.DB);
        const { email, password } = (await request.json()) as any;

        if (!email || !password) {
            return NextResponse.json({ success: false, error: 'Email and password required' }, { status: 400 });
        }

        let user = await db.select().from(users).where(eq(users.email, email)).get();

        if (user) {
            const isValid = await bcrypt.compare(password, user.passwordHash);
            if (!isValid) {
                return NextResponse.json({ success: false, error: '密码错误' }, { status: 401 });
            }
        } else {
            // SECURITY: Allowlist Registration
            // Only allow specific email to register for the first time
            const ALLOWED_EMAIL = 'kevin@admin.com';

            if (email.toLowerCase() !== ALLOWED_EMAIL) {
                return NextResponse.json({
                    success: false,
                    error: '系统当前为私有部署状态，拒绝陌生访客注册。'
                }, { status: 403 });
            }

            const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36);
            const passwordHash = await bcrypt.hash(password, 10);

            await db.insert(users).values({ id, email, passwordHash });
            user = { id, email, passwordHash };
        }

        const response = NextResponse.json({ success: true, user: { id: user.id, email: user.email } });

        response.cookies.set('auth_session', String(user.id), {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 60 * 60 * 24 * 30 // 30 days
        });

        return response;
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function GET(request: Request) {
    const sessionId = request.headers.get('cookie')?.split('auth_session=')?.[1]?.split(';')?.[0];
    if (sessionId) {
        return NextResponse.json({ authenticated: true, userId: sessionId });
    }
    return NextResponse.json({ authenticated: false });
}
