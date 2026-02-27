import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDb } from '@/db/index';
import { polls, pollOptions, pollResponses } from '@/db/schema';
import { eq } from 'drizzle-orm';

// GET: Fetch poll details + options (PUBLIC — no auth needed)
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const { env } = await getCloudflareContext();
        const db = getDb(env.DB);

        const poll = await db.select().from(polls).where(eq(polls.id, id)).get();
        if (!poll) return NextResponse.json({ success: false, error: '投票不存在' }, { status: 404 });
        if (!poll.isActive) return NextResponse.json({ success: false, error: '该投票已关闭' }, { status: 410 });

        // Check access code from query param
        const url = new URL(request.url);
        const code = url.searchParams.get('code');
        if (poll.accessCode && poll.accessCode !== code) {
            return NextResponse.json({
                success: false,
                needsCode: true,
                error: '需要访问码'
            }, { status: 403 });
        }

        const options = await db.select().from(pollOptions)
            .where(eq(pollOptions.pollId, id))
            .orderBy(pollOptions.sortOrder);

        return NextResponse.json({
            success: true,
            data: {
                id: poll.id,
                title: poll.title,
                description: poll.description,
                type: poll.type,
                hasAccessCode: !!poll.accessCode,
                options: options.map(o => ({ id: o.id, content: o.content }))
            }
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

// POST: Submit a vote/response (PUBLIC — no auth needed)
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const { env } = await getCloudflareContext();
        const db = getDb(env.DB);
        const body: any = await request.json();

        const poll = await db.select().from(polls).where(eq(polls.id, id)).get();
        if (!poll) return NextResponse.json({ success: false, error: '投票不存在' }, { status: 404 });
        if (!poll.isActive) return NextResponse.json({ success: false, error: '该投票已关闭' }, { status: 410 });

        // Retrieve valid options to prevent Cross-Poll or Fake UUID Injection
        const validOptions = await db.select({ id: pollOptions.id }).from(pollOptions).where(eq(pollOptions.pollId, id));
        const validOptionIds = new Set(validOptions.map(o => o.id));

        // Verify access code
        if (poll.accessCode && poll.accessCode !== body.accessCode) {
            return NextResponse.json({ success: false, error: '访问码错误' }, { status: 403 });
        }

        // Build a robust anti-spam hash using Edge IP + User Fingerprint
        const clientIp = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '127.0.0.1';
        const rawFingerprint = body.fingerprint || 'unknown';

        // Hash them together to prevent easy spoofing of just the JS fingerprint
        const encoder = new TextEncoder();
        const data = encoder.encode(clientIp + rawFingerprint + "mb-spam-salt");
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const secureFingerprint = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // Check if already voted (by secure fingerprint)
        const existing = await db.select().from(pollResponses)
            .where(eq(pollResponses.pollId, id))
            .all();
        const alreadyVoted = existing.some(r => r.fingerprint === secureFingerprint);
        if (alreadyVoted) {
            return NextResponse.json({ success: false, error: '您已经参与过此投票' }, { status: 409 });
        }

        if (poll.type === 'open_text') {
            // Free text response
            await db.insert(pollResponses).values({
                id: crypto.randomUUID(),
                pollId: id,
                optionId: null,
                textContent: body.textContent || '',
                fingerprint: secureFingerprint,
                createdAt: Date.now()
            });
        } else if (poll.type === 'single_choice') {
            if (!body.optionId || !validOptionIds.has(body.optionId)) {
                return NextResponse.json({ success: false, error: '无效的选项' }, { status: 400 });
            }
            await db.insert(pollResponses).values({
                id: crypto.randomUUID(),
                pollId: id,
                optionId: body.optionId,
                textContent: null,
                fingerprint: secureFingerprint,
                createdAt: Date.now()
            });
        } else if (poll.type === 'multi_choice') {
            if (!body.optionIds || !Array.isArray(body.optionIds) || body.optionIds.length === 0) {
                return NextResponse.json({ success: false, error: '请至少选择一个选项' }, { status: 400 });
            }
            // Defensively filter out any injected invalid option IDs
            const sanitizedOptionIds = body.optionIds.filter((id: string) => validOptionIds.has(id));
            if (sanitizedOptionIds.length === 0) {
                return NextResponse.json({ success: false, error: '没有有效的选项可提交' }, { status: 400 });
            }

            await Promise.all(sanitizedOptionIds.map((optId: string) =>
                db.insert(pollResponses).values({
                    id: crypto.randomUUID(),
                    pollId: id,
                    optionId: optId,
                    textContent: null,
                    fingerprint: secureFingerprint,
                    createdAt: Date.now()
                })
            ));
        }

        return NextResponse.json({ success: true, message: '感谢您的参与！' });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
