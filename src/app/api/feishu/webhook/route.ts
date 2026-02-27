import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDb } from '@/db/index';
import { userSettings, ideas, scheduledTasks } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { replyMessage } from '@/lib/feishu';

const SYSTEM_PROMPT = `你是 Magic Ball 工具箱的 AI 助手。用户通过飞书与你对话，你需要理解意图并返回**严格合法的 JSON 命令**。

# 可用插件

## 1. 闪念笔记
{"action": "create_idea", "content": "笔记内容", "tags": ["标签"]}

## 2. 投票收集
{"action": "create_poll", "title": "标题", "description": null, "type": "single_choice", "options": ["选项1", "选项2"], "accessCode": null}
type: "single_choice" | "multi_choice" | "open_text"

## 3. 日程调度
{"action": "schedule_task", "title": "任务名", "triggerAt": epoch毫秒, "recurrence": null, "taskAction": "reminder", "taskPayload": {"message": "内容"}}
recurrence: null | "daily" | "weekly" | "monthly"
taskAction: "create_idea" | "ai_prompt" | "reminder"

## 4. 页面导航
{"action": "navigate", "path": "/tools/ideas"}

## 5. 通用对话
{"action": "chat", "message": "回复内容"}

# 输出格式
返回: {"transcript": null, "actions": [{"action": "...", ...}]}
actions 是数组，多个任务拆分为多个元素。

# 规则
1. 只返回合法 JSON，禁止 JSON 外的文字
2. 多个任务全部拆分为独立 action
3. tags 不带 # 号
4. 用中文回复
`;

// Deduplication: Feishu retries events if response >3s, prevent double processing
const processedEvents = new Set<string>();
const MAX_CACHE = 200;

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
        if (eventId) {
            if (processedEvents.has(eventId)) {
                return NextResponse.json({ code: 0 }); // already processed
            }
            processedEvents.add(eventId);
            // Prevent memory leak: trim old entries
            if (processedEvents.size > MAX_CACHE) {
                const first = processedEvents.values().next().value;
                if (first) processedEvents.delete(first);
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

        // Only handle text messages for now
        if (messageType !== 'text' || !messageId) {
            return NextResponse.json({ code: 0 });
        }

        // Extract text content
        let userText = '';
        try {
            const content = JSON.parse(event.message.content);
            userText = content.text || '';
        } catch {
            return NextResponse.json({ code: 0 });
        }

        if (!userText.trim()) {
            return NextResponse.json({ code: 0 });
        }

        // --- Step 3: Process via AI pipeline ---
        const { env } = await getCloudflareContext();
        const db = getDb(env.DB);

        // Find a user with Gemini API key configured
        const allSettings = await db.select().from(userSettings)
            .where(eq(userSettings.key, 'gemini_api_key'));

        if (allSettings.length === 0) {
            await replyMessage(messageId, '⚠️ 还没有配置 Gemini API Key，请在 Magic Ball 设置页面添加。');
            return NextResponse.json({ code: 0 });
        }

        const userId = allSettings[0].userId;
        const apiKey = allSettings[0].value;

        // Get model preference
        const modelSettings = await db.select().from(userSettings)
            .where(eq(userSettings.key, 'gemini_model'));
        const model = modelSettings.find(s => s.userId === userId)?.value || 'gemini-2.0-flash';

        // Call Gemini
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const now = new Date();

        const geminiRes = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: userText }] }],
                systemInstruction: {
                    parts: [{ text: SYSTEM_PROMPT + `\n\n# 当前时间\n${now.toISOString()}，epoch: ${now.getTime()}` }]
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

        // --- Step 4: Execute actions and collect results ---
        const results: string[] = [];

        for (const cmd of actions) {
            try {
                switch (cmd.action) {
                    case 'create_idea': {
                        const tags = cmd.tags || [];
                        const content = tags.length > 0
                            ? cmd.content + ' ' + tags.map((t: string) => `#${t}`).join(' ')
                            : cmd.content;
                        await db.insert(ideas).values({
                            id: crypto.randomUUID(),
                            userId,
                            type: 'text',
                            content,
                            tags: JSON.stringify(tags),
                            createdAt: Date.now(),
                        });
                        results.push(`✅ 已记录: "${cmd.content}"`);
                        break;
                    }
                    case 'create_poll': {
                        // Use internal API call for polls (complex logic)
                        results.push(`📊 投票创建请在网页端操作: "${cmd.title}"`);
                        break;
                    }
                    case 'schedule_task': {
                        await db.insert(scheduledTasks).values({
                            id: crypto.randomUUID(),
                            userId,
                            title: cmd.title,
                            triggerAt: cmd.triggerAt,
                            recurrence: cmd.recurrence || null,
                            actionType: cmd.taskAction || 'reminder',
                            actionPayload: JSON.stringify(cmd.taskPayload || {}),
                            status: 'active',
                            createdAt: Date.now(),
                        });
                        results.push(`📅 已创建定时任务: "${cmd.title}"`);
                        break;
                    }
                    case 'navigate': {
                        results.push(`🔗 请在网页端访问: ${cmd.path}`);
                        break;
                    }
                    case 'chat': {
                        results.push(cmd.message || '好的');
                        break;
                    }
                    default:
                        results.push(`未知操作: ${cmd.action}`);
                }
            } catch (err: any) {
                results.push(`❌ 执行失败: ${err.message}`);
            }
        }

        // Reply with all results
        await replyMessage(messageId, results.join('\n'));
        return NextResponse.json({ code: 0 });

    } catch (error: any) {
        console.error('Feishu webhook error:', error);
        return NextResponse.json({ code: 0 }); // Always return 200 to Feishu
    }
}
