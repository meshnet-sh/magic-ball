import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDb } from '@/db/index';
import { userSettings } from '@/db/schema';
import { eq } from 'drizzle-orm';

function getUserIdFromCookie(request: Request) {
    const cookieHeader = request.headers.get('cookie') || "";
    const match = cookieHeader.match(/auth_session=([^;]+)/);
    return match ? match[1] : null;
}

const SYSTEM_PROMPT = `你是 Magic Ball 工具箱的 AI 助手。用户通过语音或文字与你对话，你需要理解意图并返回**严格合法的 JSON 命令**。

# 可用插件及其能力

## 1. 闪念笔记 (ideas)
- **能力**: 创建文字笔记，支持标签
- **命令格式**:
\`\`\`json
{
  "action": "create_idea",
  "content": "笔记的文字内容",
  "tags": ["标签1", "标签2"]
}
\`\`\`
- **示例输入**: "记一下明天下午3点和王总开会"
- **示例输出**:
\`\`\`json
{"action": "create_idea", "content": "明天下午3点和王总开会", "tags": ["会议"]}
\`\`\`

## 2. 投票收集 (polls)
- **能力**: 创建三种类型的投票 — 单选、多选、文本意见征集
- **命令格式**:
\`\`\`json
{
  "action": "create_poll",
  "title": "投票标题",
  "description": "可选的补充描述，没有就填 null",
  "type": "single_choice | multi_choice | open_text",
  "options": ["选项1", "选项2", "选项3"],
  "accessCode": null
}
\`\`\`
- type 只能是 "single_choice", "multi_choice", "open_text" 三选一
- 当 type 为 "open_text" 时，options 必须为空数组 []
- 当 type 为 "single_choice" 或 "multi_choice" 时，options 至少 2 项
- accessCode 为 null 表示公开投票，设置字符串则需要输入访问码才能投票
- **示例输入**: "帮我发个投票问大家周五团建去哪里，选项有密室逃脱、剧本杀和桌游"
- **示例输出**:
\`\`\`json
{"action": "create_poll", "title": "周五团建去哪里？", "description": null, "type": "single_choice", "options": ["密室逃脱", "剧本杀", "桌游"], "accessCode": null}
\`\`\`

## 4. 日程调度 (scheduler)
- **能力**: 创建定时/重复任务，查看任务列表，取消任务
- **创建定时任务**:
\`\`\`json
{"action": "schedule_task", "title": "任务名称", "triggerAt": 1709110800000, "recurrence": null, "taskAction": "create_idea", "taskPayload": {"content": "笔记内容", "tags": ["标签"]}}
\`\`\`
- triggerAt: **epoch 毫秒时间戳**（必须根据用户描述的时间计算）
- recurrence: null(一次性) | "minutes:X"(每X分钟) | "hours:X"(每X小时) | "daily" | "weekly" | "monthly"
- **分钟级重复**: 用户说"每5分钟提醒我"时，recurrence 填 "minutes:5"；"每2小时"填 "hours:2"
- taskAction: "create_idea" | "ai_prompt" | "reminder"
- taskPayload: 对应操作的参数 JSON
- **当前时间**: 请根据对话上下文推算时间。如果用户说"明天下午3点"，你需要计算出对应的 epoch 毫秒时间戳
- **示例输入**: "每天早上9点提醒我写日报"
- **示例输出**:
\`\`\`json
{"action": "schedule_task", "title": "每日日报提醒", "triggerAt": 1709190000000, "recurrence": "daily", "taskAction": "reminder", "taskPayload": {"message": "记得写今天的日报"}}
\`\`\`
- **查看任务列表**:
\`\`\`json
{"action": "list_tasks"}
\`\`\`
- **取消任务**:
\`\`\`json
{"action": "cancel_task", "taskId": "任务ID"}
\`\`\`

## 5. 页面导航 (navigate)
- **能力**: 跳转到工具箱内的页面
- **命令格式**:
\`\`\`json
{"action": "navigate", "path": "/tools/ideas"}
\`\`\`
- 可用路径: "/tools/ideas" (闪念笔记), "/tools/polls" (投票管理), "/tools/scheduler" (日程调度), "/settings" (设置)
- **示例输入**: "打开设置页面"
- **示例输出**:
\`\`\`json
{"action": "navigate", "path": "/settings"}
\`\`\`

## 6. 通用对话 (chat)
- **能力**: 回答与插件无关的问题、闲聊、提供建议
- **命令格式**:
\`\`\`json
{"action": "chat", "message": "你的回复内容"}
\`\`\`

# 输出格式

始终返回以下 JSON 结构（不要添加任何 JSON 之外的文字）:
\`\`\`json
{
  "transcript": "如果用户通过语音输入，把你听到的原文转写在这里；如果是文字输入则填 null",
  "actions": [
    {"action": "create_idea", "content": "...", "tags": [...]},
    {"action": "create_poll", ...}
  ]
}
\`\`\`

- **actions 是数组**: 如果用户一次说了多个任务，每个任务对应一个 action 对象，按顺序放入 actions 数组
- 如果只有一个任务，actions 数组也只有一个元素
- transcript 仅在处理语音时填写，文字输入时填 null

# 严格规则
1. **始终且只返回上述格式的合法 JSON 对象**，禁止在 JSON 外添加任何文字、解释或 markdown 标记
2. 如果用户一次说了多个任务，**全部拆分为独立的 action 放入 actions 数组**
3. 如果你不确定用户想做什么，用 chat 类型回复并**列出你能做的事情**
4. tags 中的标签**不要**带 # 号前缀
5. 如果前一次执行失败了，用户可能会把错误信息告诉你，请根据错误信息调整你的命令重试
6. 用中文回复 chat 消息`;

export async function POST(request: Request) {
    try {
        const userId = getUserIdFromCookie(request);
        if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const { env } = await getCloudflareContext();
        const db = getDb(env.DB);

        // Get user's Gemini settings
        const settings = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
        const settingsMap: Record<string, string> = {};
        settings.forEach(s => { settingsMap[s.key] = s.value; });

        const apiKey = settingsMap['gemini_api_key'];
        const model = settingsMap['gemini_model'] || 'gemini-flash-latest';

        if (!apiKey) {
            return NextResponse.json({
                success: true,
                command: {
                    action: 'chat',
                    message: '⚠️ 您还没有配置 Gemini API Key。请到 **设置 → AI 能力配置** 中添加您的 API Key。'
                }
            });
        }

        const body: any = await request.json();
        const messages: { role: string; text: string }[] = body.messages;
        const audioBase64: string | undefined = body.audio;

        if (!messages || messages.length === 0) {
            return NextResponse.json({ success: false, error: '请输入指令' }, { status: 400 });
        }

        // Convert to Gemini format
        const contents = messages.map((m, i) => {
            const parts: any[] = [{ text: m.text }];
            // If this is the last user message and we have audio, add it as inline_data
            if (audioBase64 && i === messages.length - 1 && m.role === 'user') {
                parts.push({
                    inlineData: {
                        mimeType: 'audio/webm',
                        data: audioBase64
                    }
                });
            }
            return {
                role: m.role === 'user' ? 'user' : 'model',
                parts
            };
        });

        // Call Gemini API
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const geminiRes = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents,
                systemInstruction: {
                    parts: [{ text: SYSTEM_PROMPT + `\n\n# 当前时间\n当前时间是: ${new Date().toISOString()}，epoch 毫秒: ${Date.now()}。请据此计算用户描述的时间对应的 triggerAt 时间戳。` }]
                },
                generationConfig: {
                    responseMimeType: 'application/json',
                    temperature: 0.3
                }
            })
        });

        if (!geminiRes.ok) {
            const errData: any = await geminiRes.json().catch(() => ({}));
            return NextResponse.json({
                success: true,
                command: {
                    action: 'chat',
                    message: `❌ Gemini API 调用失败: ${errData?.error?.message || geminiRes.statusText}`
                }
            });
        }

        const geminiData: any = await geminiRes.json();
        const responseText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!responseText) {
            return NextResponse.json({
                success: true,
                command: { action: 'chat', message: '🤔 AI 没有返回有效响应，请重试。' }
            });
        }

        try {
            const parsed = JSON.parse(responseText);
            // New format: { transcript, actions: [...] }
            if (parsed.actions && Array.isArray(parsed.actions)) {
                return NextResponse.json({
                    success: true,
                    transcript: parsed.transcript || null,
                    actions: parsed.actions
                });
            }
            // Backward compat: single command object
            return NextResponse.json({
                success: true,
                transcript: parsed.transcript || null,
                actions: [parsed]
            });
        } catch {
            return NextResponse.json({
                success: true,
                transcript: null,
                actions: [{ action: 'chat', message: responseText }]
            });
        }
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
