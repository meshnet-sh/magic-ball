import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDb } from '@/db/index';
import { getVerifiedUserIdFromCookie } from '@/lib/auth';
import { triggerN8nWorkflow } from '@/lib/n8n';

export async function POST(request: Request) {
    try {
        const userId = await getVerifiedUserIdFromCookie(request);
        if (!userId) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { event, payload } = body;

        if (!event) {
            return NextResponse.json({ success: false, error: 'Event name is required' }, { status: 400 });
        }

        const { env } = await getCloudflareContext();
        const db = getDb(env.DB);

        await triggerN8nWorkflow(db, userId, event, payload || {});

        return NextResponse.json({ success: true, message: `🚀 已触发外部工作流: ${event}` });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message || 'Trigger external workflow failed' }, { status: 500 });
    }
}
