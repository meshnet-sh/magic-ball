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

        // Verify access code
        if (poll.accessCode && poll.accessCode !== body.accessCode) {
            return NextResponse.json({ success: false, error: '访问码错误' }, { status: 403 });
        }

        const fingerprint = body.fingerprint || 'unknown';

        // Check if already voted (by fingerprint)
        const existing = await db.select().from(pollResponses)
            .where(eq(pollResponses.pollId, id))
            .all();
        const alreadyVoted = existing.some(r => r.fingerprint === fingerprint);
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
                fingerprint,
                createdAt: Date.now()
            });
        } else if (poll.type === 'single_choice') {
            if (!body.optionId) return NextResponse.json({ success: false, error: '请选择一个选项' }, { status: 400 });
            await db.insert(pollResponses).values({
                id: crypto.randomUUID(),
                pollId: id,
                optionId: body.optionId,
                textContent: null,
                fingerprint,
                createdAt: Date.now()
            });
        } else if (poll.type === 'multi_choice') {
            if (!body.optionIds || body.optionIds.length === 0) {
                return NextResponse.json({ success: false, error: '请至少选择一个选项' }, { status: 400 });
            }
            await Promise.all(body.optionIds.map((optId: string) =>
                db.insert(pollResponses).values({
                    id: crypto.randomUUID(),
                    pollId: id,
                    optionId: optId,
                    textContent: null,
                    fingerprint,
                    createdAt: Date.now()
                })
            ));
        }

        return NextResponse.json({ success: true, message: '感谢您的参与！' });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
