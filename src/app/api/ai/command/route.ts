import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDb } from '@/db/index';
import { userSettings } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { executeAction, loadMemories, saveMemory, getSystemPrompt } from '@/lib/executeAction';

import { getVerifiedUserIdFromCookie } from '@/lib/auth';

export async function POST(request: Request) {
    try {
        const userId = await getVerifiedUserIdFromCookie(request);
        if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const { env } = await getCloudflareContext();
        const db = getDb(env.DB);

        // Get the admin user's settings (Global LLM capability)
        const ADMIN_EMAIL = 'meshnet@163.com';
        const { users } = await import('@/db/schema');
        const adminUser = await db.select().from(users).where(eq(users.email, ADMIN_EMAIL)).get();
        let apiKey, model = 'gemini-2.0-flash';

        if (adminUser) {
            const adminSettings = await db.select().from(userSettings)
                .where(eq(userSettings.userId, adminUser.id));

            const settingsMap: Record<string, string> = {};
            adminSettings.forEach(s => { settingsMap[s.key] = s.value; });

            apiKey = settingsMap['gemini_api_key'];
            if (settingsMap['gemini_model']) {
                model = settingsMap['gemini_model'];
            }
        }

        if (!apiKey) {
            return NextResponse.json({
                success: true,
                command: {
                    action: 'chat',
                    message: '⚠️ 系统缺少全局的 Gemini API Key。请管理员到 **设置 → AI 能力配置** 中添加 API Key。'
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

        // Load recent memories
        const memStr = await loadMemories(db, userId, 15);

        // Call Gemini API
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const geminiRes = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents,
                systemInstruction: {
                    parts: [{ text: getSystemPrompt() + `\n\n# 当前时间(北京时间)\n当前时间是: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}，epoch 毫秒: ${Date.now()}。这代表真实的本地时间，请据此计算用户描述的时间对应的 triggerAt 绝对毫秒时间戳。` + memStr }]
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
            let actions = parsed.actions || [parsed];

            // Save conversation memory
            const userMsg = messages.filter(m => m.role === 'user').pop()?.text || '(语音/无文本)';
            const actionSummary = actions.map((a: any) =>
                a.action === 'chat' ? `回复: ${a.message?.substring(0, 50)}` : `执行: ${a.action}`
            ).join(', ');

            await saveMemory(db, userId, 'conversation',
                `用户: "${userMsg}" → AI: ${actionSummary}`,
                3, ['chat'], 'web');

            return NextResponse.json({
                success: true,
                transcript: parsed.transcript || null,
                actions
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
