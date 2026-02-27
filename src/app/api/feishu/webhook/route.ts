import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDb } from '@/db/index';
import { userSettings, ideas, scheduledTasks } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { replyMessage } from '@/lib/feishu';
import { executeAction, loadMemories, saveMemory } from '@/lib/executeAction';
import { feishuEvents } from '@/db/schema';

const SYSTEM_PROMPT = `你是 Magic Ball 工具箱的 AI 助手。用户通过飞书与你对话，你需要理解意图并返回**严格合法的 JSON 命令**。

# 可用插件

## 1. 闪念笔记
{"action": "create_idea", "content": "笔记内容", "tags": ["标签"]}

## 2. 投票收集
{"action": "create_poll", "title": "标题", "description": null, "type": "single_choice", "options": ["选项1", "选项2"], "accessCode": null}
type: "single_choice" | "multi_choice" | "open_text"

## 3. 日程调度
- **交互策略**: 只要用户描述的时间意图相对清晰，请直接返回 schedule_task 和一个简短的 chat 进行组合确认回复。仅在时间完全无法推断时才单用 chat 询问。
{"action": "schedule_task", "title": "任务名", "triggerAt": epoch毫秒, "recurrence": null, "scheduledAction": {"action": "reminder", "message": "内容"}}
recurrence: null | "minutes:X" | "hours:X" | "daily" | "weekly" | "monthly"
scheduledAction: 任何合法的 action JSON (可嵌套 ai_agent 唤醒AI)
分钟级示例: "每5分钟提醒我" → recurrence: "minutes:5"

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

        // --- Step 4: Process via AI pipeline ---

        // Find a user with Gemini API key configured
        const allSettings = await db.select().from(userSettings)
            .where(eq(userSettings.key, 'gemini_api_key'));

        if (allSettings.length === 0) {
            await replyMessage(messageId, '⚠️ 还没有配置 Gemini API Key，请在 Magic Ball 设置页面添加。');
            return NextResponse.json({ code: 0 });
        }

        const userId = allSettings[0].userId;
        const apiKey = allSettings[0].value;

        // Save the sender's Feishu open_id for proactive push (cron notifications)
        const senderOpenId = event?.sender?.sender_id?.open_id;
        if (senderOpenId) {
            const existing = await db.select().from(userSettings)
                .where(and(eq(userSettings.userId, userId), eq(userSettings.key, 'feishu_open_id')));
            if (existing.length === 0) {
                await db.insert(userSettings).values({
                    id: crypto.randomUUID(), userId, key: 'feishu_open_id', value: senderOpenId
                });
            } else if (existing[0].value !== senderOpenId) {
                await db.update(userSettings).set({ value: senderOpenId })
                    .where(and(eq(userSettings.userId, userId), eq(userSettings.key, 'feishu_open_id')));
            }
        }

        // Get model preference
        const modelSettings = await db.select().from(userSettings)
            .where(eq(userSettings.key, 'gemini_model'));
        const model = modelSettings.find(s => s.userId === userId)?.value || 'gemini-2.0-flash';

        // Call Gemini
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const now = new Date();
        const memStr = await loadMemories(db, userId, 15);

        const geminiRes = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: userText }] }],
                systemInstruction: {
                    parts: [{ text: SYSTEM_PROMPT + `\n\n# 当前时间(北京时间)\n${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}，epoch: ${now.getTime()}，请以此为基准进行所有日期时间推导。` + memStr }]
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
