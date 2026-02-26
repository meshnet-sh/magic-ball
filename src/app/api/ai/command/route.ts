import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDb } from '@/db/index';
import { userSettings } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

function getUserIdFromCookie(request: Request) {
    const cookieHeader = request.headers.get('cookie') || "";
    const match = cookieHeader.match(/auth_session=([^;]+)/);
    return match ? match[1] : null;
}

const SYSTEM_PROMPT = `你是 Magic Ball 工具箱的 AI 助手。用户通过语音或文字向你发送指令，你需要理解意图并返回一个 JSON 命令。

可用插件和操作:

1. **闪念笔记** (ideas) - 快速记录文字想法
   - 创建文字笔记: { "action": "create_idea", "content": "笔记内容", "tags": ["可选标签"] }

2. **投票收集** (polls) - 创建投票或意见收集
   - 创建单选投票: { "action": "create_poll", "title": "投票标题", "type": "single_choice", "options": ["选项1", "选项2", ...], "accessCode": null }
   - 创建多选投票: { "action": "create_poll", "title": "投票标题", "type": "multi_choice", "options": ["选项1", "选项2", ...], "accessCode": null }
   - 创建意见收集: { "action": "create_poll", "title": "征集标题", "type": "open_text", "options": [], "accessCode": null }

3. **页面导航**
   - 打开闪念笔记: { "action": "navigate", "path": "/tools/ideas" }
   - 打开投票管理: { "action": "navigate", "path": "/tools/polls" }
   - 打开设置: { "action": "navigate", "path": "/settings" }

4. **通用对话** - 如果用户只是在闲聊或询问非插件相关的问题
   - { "action": "chat", "message": "你的回复内容" }

规则:
- 始终只返回一个合法的 JSON 对象，不要添加任何其他格式或解释
- 如果用户说"记一下..."或"记录..."或类似的话，用 create_idea
- 如果用户说"帮我发个投票..."或"创建一个调查..."，用 create_poll
- 如果意图不明确，用 chat 回复并建议用户可以做什么
- 用中文回复 chat 消息
- tags 中的标签不要带 # 号前缀`

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
        const userMessage = body.message;

        if (!userMessage) {
            return NextResponse.json({ success: false, error: '请输入指令' }, { status: 400 });
        }

        // Call Gemini API
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const geminiRes = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [
                    { role: 'user', parts: [{ text: userMessage }] }
                ],
                systemInstruction: {
                    parts: [{ text: SYSTEM_PROMPT }]
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

        // Parse JSON command
        try {
            const command = JSON.parse(responseText);
            return NextResponse.json({ success: true, command });
        } catch {
            return NextResponse.json({
                success: true,
                command: { action: 'chat', message: responseText }
            });
        }
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
