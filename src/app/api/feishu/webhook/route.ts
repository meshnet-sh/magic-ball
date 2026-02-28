import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDb } from '@/db/index';
import { userSettings, ideas, scheduledTasks } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { replyMessage } from '@/lib/feishu';
import { executeAction, loadMemories, saveMemory, getSystemPrompt } from '@/lib/executeAction';
import { feishuEvents } from '@/db/schema';

// POST handler for Feishu webhook events
export async function POST(request: Request) {
    try {
        const body: any = await request.json();

        // --- Step 1: URL Verification (challenge-response) ---
        if (body.type === 'url_verification') {
            return NextResponse.json({ challenge: body.challenge });
        }

        // --- Step 2: Dedup check using event_id ---
        const eventId = body?.header?.event_id;

        const { env } = await getCloudflareContext();
        const db = getDb(env.DB);

        if (eventId) {
            try {
                await db.insert(feishuEvents).values({ eventId, createdAt: Date.now() });
            } catch (err: any) {
                // Unique constraint failed because event is already processing/processed by another instance
                return NextResponse.json({ code: 0 });
            }
        }

        // --- Step 3: Event callback v2.0 schema ---
        const eventType = body?.header?.event_type;
        if (eventType !== 'im.message.receive_v1') {
            return NextResponse.json({ code: 0 }); // acknowledge but ignore
        }

        const event = body.event;
        const messageType = event?.message?.message_type;
        const messageId = event?.message?.message_id;

        // Only handle text, image, audio, and post (rich text) messages
        const validTypes = ['text', 'image', 'audio', 'post'];
        if (!validTypes.includes(messageType) || !messageId) {
            return NextResponse.json({ code: 0 });
        }

        // Extract text content and potential media
        let userText = '';
        const mediaParts: Array<{ inlineData: { mimeType: string, data: string } }> = [];

        try {
            const content = JSON.parse(event.message.content);

            if (messageType === 'text') {
                userText = content.text || '';
            } else if (messageType === 'image') {
                const imageKey = content.image_key;
                if (imageKey) {
                    const { downloadResource } = await import('@/lib/feishu');
                    const { buffer, mimeType } = await downloadResource(messageId, imageKey, 'image');
                    const base64Data = Buffer.from(buffer).toString('base64');
                    mediaParts.push({ inlineData: { mimeType, data: base64Data } });
                    userText = "我发了一张图片。请结合我的『上一条发言/要求（见下方记忆）』，从图片中提取相关要素并执行对应的插件指令。如果没有特别指令，请简述图片重点。";
                }
            } else if (messageType === 'audio') {
                const fileKey = content.file_key;
                if (fileKey) {
                    const { downloadResource } = await import('@/lib/feishu');
                    const { buffer, mimeType } = await downloadResource(messageId, fileKey, 'file');

                    let finalMimeType = mimeType;
                    if (mimeType === 'application/octet-stream' || mimeType.includes('opus') || mimeType.includes('amr')) {
                        finalMimeType = 'audio/ogg';
                    }

                    const base64Data = Buffer.from(buffer).toString('base64');
                    mediaParts.push({ inlineData: { mimeType: finalMimeType, data: base64Data } });
                    userText = "我发了一段语音。请结合我对你的『上一条发言/要求』，综合分析这段语音内容并执行相应指令。";
                }
            } else if (messageType === 'post') {
                // Post messages contain rich text content in content.post.zh_cn.content (array of arrays)
                const textNodes: string[] = [];
                const parsedLocale = content.zh_cn || content.en_us || content.post?.zh_cn || content.post?.en_us;

                if (parsedLocale && Array.isArray(parsedLocale.content)) {
                    for (const line of parsedLocale.content) {
                        for (const element of line) {
                            if (element.tag === 'text' && element.text) {
                                textNodes.push(element.text);
                            } else if (element.tag === 'img' && element.image_key) {
                                const { downloadResource } = await import('@/lib/feishu');
                                const { buffer, mimeType } = await downloadResource(messageId, element.image_key, 'image');
                                const base64Data = Buffer.from(buffer).toString('base64');
                                mediaParts.push({ inlineData: { mimeType, data: base64Data } });
                            } else if (element.tag === 'media' && element.file_key) {
                                const { downloadResource } = await import('@/lib/feishu');
                                const { buffer, mimeType } = await downloadResource(messageId, element.file_key, 'file');

                                let finalMimeType = mimeType;
                                if (mimeType === 'application/octet-stream' || mimeType.includes('opus') || mimeType.includes('amr')) {
                                    finalMimeType = 'audio/ogg';
                                }

                                const base64Data = Buffer.from(buffer).toString('base64');
                                mediaParts.push({ inlineData: { mimeType: finalMimeType, data: base64Data } });
                            }
                        }
                    }
                }
                userText = textNodes.join(' ').trim();

                // Provide fallback prompt if post was just media without text
                if (!userText && mediaParts.length > 0) {
                    userText = "请分析我发送的媒体内容，提取其中的意图或待办。";
                }
            }
        } catch (e) {
            console.error('Failed to parse Feishu message content or download media:', e);
            return NextResponse.json({ code: 0 });
        }

        if (messageType === 'text' && !userText.trim()) {
            return NextResponse.json({ code: 0 });
        }

        // --- Step 4: Process via AI pipeline (Multi-Tenant) ---

        const senderOpenId = event?.sender?.sender_id?.open_id;
        if (!senderOpenId) {
            return NextResponse.json({ code: 0 }); // Can't identify sender
        }

        // 1. Identify User by Feishu Open ID
        const senderSettings = await db.select().from(userSettings)
            .where(and(eq(userSettings.key, 'feishu_open_id'), eq(userSettings.value, senderOpenId)));

        if (senderSettings.length === 0) {
            await replyMessage(messageId, `⚠️ 未绑定账号\n\n欢迎使用 Magic Ball！由于您尚未绑定，系统无法为您提供专属服务。\n\n请前往 Web 端的「系统与AI配置」页面，将您的专属授权码填入下方的飞书绑定框中：\n\n${senderOpenId}`);
            return NextResponse.json({ code: 0 });
        }

        const userId = senderSettings[0].userId;

        // 2. Look up the Admin's Global Gemini API Key for proxy billing
        const ADMIN_EMAIL = 'meshnet@163.com';
        const { users } = await import('@/db/schema');
        const adminUser = await db.select().from(users).where(eq(users.email, ADMIN_EMAIL)).get();

        if (!adminUser) {
            await replyMessage(messageId, '❌ 系统未初始化：找不到管理员账号，无法调用公共算力池。');
            return NextResponse.json({ code: 0 });
        }

        const apiSettings = await db.select().from(userSettings)
            .where(and(eq(userSettings.userId, adminUser.id), eq(userSettings.key, 'gemini_api_key'))).get();

        if (!apiSettings || !apiSettings.value) {
            await replyMessage(messageId, '❌ 系统错误：管理员尚未配置公共 Gemini API Key。');
            return NextResponse.json({ code: 0 });
        }

        const apiKey = apiSettings.value;

        // Get model preference
        const modelSettings = await db.select().from(userSettings)
            .where(eq(userSettings.key, 'gemini_model'));
        const model = modelSettings.find(s => s.userId === userId)?.value || 'gemini-2.0-flash';

        // Call Gemini
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const now = new Date();
        const memStr = await loadMemories(db, userId, 15);

        const parts: any[] = [];
        if (userText) parts.push({ text: userText });
        for (const mp of mediaParts) {
            parts.push(mp);
        }

        const geminiRes = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts }],
                systemInstruction: {
                    parts: [{ text: getSystemPrompt() + `\n\n# 当前时间(北京时间)\n${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}，epoch: ${now.getTime()}，请以此为基准进行所有日期时间推导。` + memStr }]
                },
                generationConfig: {
                    responseMimeType: 'application/json',
                    temperature: 0.3,
                },
            }),
        });

        if (!geminiRes.ok) {
            await replyMessage(messageId, '❌ AI 调用失败，请稍后重试。');
            return NextResponse.json({ code: 0 });
        }

        const geminiData: any = await geminiRes.json();
        const responseText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!responseText) {
            await replyMessage(messageId, '🤔 AI 没有返回有效响应，请重试。');
            return NextResponse.json({ code: 0 });
        }

        // Parse AI response
        let actions: any[] = [];
        try {
            const parsed = JSON.parse(responseText);
            actions = parsed.actions || [parsed];
        } catch {
            await replyMessage(messageId, responseText);
            return NextResponse.json({ code: 0 });
        }

        // --- Step 4: Execute actions, collect results, save memory ---
        const results: string[] = [];
        const actionSummary: string[] = [];

        for (const cmd of actions) {
            const res = await executeAction(db, userId, cmd);
            results.push(res.message);

            if (cmd.action === 'chat') {
                actionSummary.push(`回复: ${cmd.message?.substring(0, 50)}`);
            } else {
                actionSummary.push(`执行: ${cmd.action}`);
            }
        }

        // Save conversation memory
        await saveMemory(db, userId, 'conversation',
            `飞书用户: "${userText}" → AI: ${actionSummary.join(', ')}`,
            3, ['chat'], 'feishu');

        // Reply with all results
        await replyMessage(messageId, results.join('\n'));
        return NextResponse.json({ code: 0 });

    } catch (error: any) {
        console.error('Feishu webhook error:', error);
        return NextResponse.json({ code: 0 }); // Always return 200 to Feishu
    }
}
