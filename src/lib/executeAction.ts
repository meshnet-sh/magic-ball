import { getDb } from '@/db/index';
import { ideas, scheduledTasks, userSettings, aiMemories, messages, polls, pollOptions } from '@/db/schema';
import { eq, desc, and } from 'drizzle-orm';

export interface ActionResult {
    ok: boolean;
    message: string;
}

/**
 * Unified action execution engine.
 * Used by: web AI command, Feishu webhook, scheduler cron, and AI agent.
 */
export async function executeAction(
    db: ReturnType<typeof getDb>,
    userId: string,
    cmd: any,
    depth: number = 0
): Promise<ActionResult> {
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
                return { ok: true, message: `✅ 已记录: "${cmd.content}"` };
            }

            case 'create_poll': {
                return { ok: true, message: `📊 投票创建请在网页端操作: "${cmd.title}"` };
            }

            case 'schedule_task': {
                // Support both old format (taskAction) and new format (scheduledAction)
                let actionType = cmd.taskAction || 'reminder';
                let actionPayload = cmd.taskPayload || {};

                if (cmd.scheduledAction) {
                    actionType = cmd.scheduledAction.action || 'reminder';
                    actionPayload = cmd.scheduledAction;
                }

                await db.insert(scheduledTasks).values({
                    id: crypto.randomUUID(),
                    userId,
                    title: cmd.title,
                    triggerAt: cmd.triggerAt,
                    recurrence: cmd.recurrence || null,
                    actionType,
                    actionPayload: typeof actionPayload === 'string' ? actionPayload : JSON.stringify(actionPayload),
                    status: 'active',
                    createdAt: Date.now(),
                });
                return { ok: true, message: `📅 已创建定时任务: "${cmd.title}"` };
            }

            case 'list_tasks': {
                const tasks = await db.select().from(scheduledTasks)
                    .where(and(eq(scheduledTasks.userId, userId), eq(scheduledTasks.status, 'active')));
                if (tasks.length === 0) return { ok: true, message: '当前没有定时任务。' };
                const taskList = tasks.map(t =>
                    `• ${t.title} — ${new Date(t.triggerAt).toLocaleString('zh-CN')}${t.recurrence ? ` (${t.recurrence})` : ''}`
                ).join('\n');
                return { ok: true, message: `📋 当前任务:\n${taskList}` };
            }

            case 'cancel_task': {
                await db.delete(scheduledTasks)
                    .where(and(eq(scheduledTasks.id, cmd.taskId), eq(scheduledTasks.userId, userId)));
                return { ok: true, message: `🗑️ 任务已取消` };
            }

            case 'reminder': {
                return { ok: true, message: `⏰ ${cmd.message || '提醒'}` };
            }

            case 'ai_agent': {
                // Phase 2: AI Agent mode — wake up AI with context
                if (depth >= 3) {
                    return { ok: false, message: '⚠️ AI Agent 递归深度已达上限 (3层)' };
                }

                // Load context data
                const contextParts: string[] = [];
                const scope = cmd.contextScope || ['ideas', 'tasks', 'memories'];

                if (scope.includes('ideas')) {
                    const recentIdeas = await db.select().from(ideas)
                        .where(eq(ideas.userId, userId))
                        .orderBy(desc(ideas.createdAt))
                        .limit(10);
                    if (recentIdeas.length > 0) {
                        contextParts.push('## 最近笔记\n' + recentIdeas.map(i =>
                            `- [${new Date(i.createdAt).toLocaleString('zh-CN')}] ${i.content.substring(0, 100)}`
                        ).join('\n'));
                    }
                }

                if (scope.includes('tasks')) {
                    const activeTasks = await db.select().from(scheduledTasks)
                        .where(and(eq(scheduledTasks.userId, userId), eq(scheduledTasks.status, 'active')));
                    if (activeTasks.length > 0) {
                        contextParts.push('## 活跃定时任务\n' + activeTasks.map(t =>
                            `- ${t.title} → ${new Date(t.triggerAt).toLocaleString('zh-CN')}${t.recurrence ? ` (${t.recurrence})` : ''}`
                        ).join('\n'));
                    }
                }

                if (scope.includes('memories')) {
                    const memories = await db.select().from(aiMemories)
                        .where(eq(aiMemories.userId, userId))
                        .orderBy(desc(aiMemories.importance), desc(aiMemories.createdAt))
                        .limit(15);
                    if (memories.length > 0) {
                        contextParts.push('## 记忆\n' + memories.map(m =>
                            `- [${m.type}|重要性${m.importance}] ${m.content.substring(0, 150)}`
                        ).join('\n'));
                    }
                }

                // Get Gemini settings
                const settings = await db.select().from(userSettings)
                    .where(eq(userSettings.userId, userId));
                const settingsMap: Record<string, string> = {};
                settings.forEach(s => { settingsMap[s.key] = s.value; });
                const apiKey = settingsMap['gemini_api_key'];
                const model = settingsMap['gemini_model'] || 'gemini-2.0-flash';

                if (!apiKey) return { ok: false, message: '⚠️ AI Agent 缺少 Gemini API Key' };

                const AGENT_PROMPT = `你是 Magic Ball AI Agent。你被定时任务唤醒来执行一个任务。
分析下面的上下文和任务提示，然后返回要执行的 actions 数组。

**【极度重要规则】**
严格且仅基于以下提供的上下文（你的局部小世界）进行总结、回忆或回答。如果在此上下文中没有找到相关信息，请如实说明“近期内部没有相关记录”，**绝对禁止**使用你自带的各种大模型维基数据或外部新闻事实来编造外部世界的"大事件"以作为敷衍。

可用 actions:
- {"action": "create_idea", "content": "...", "tags": [...]}
- {"action": "reminder", "message": "..."}
- {"action": "schedule_task", "title": "...", "triggerAt": epoch_ms, "recurrence": "...", "scheduledAction": {...}}
- {"action": "chat", "message": "..."}

返回格式: {"actions": [...]}
只返回合法 JSON，不要添加额外文字。

# 当前时间 (北京时间，你的唯一绝对时间尺度)
${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} (Epoch: ${Date.now()})

# 上下文 (你认知内的全部世界)
${contextParts.join('\n\n') || '(无上下文数据)'}
`;

                const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
                const geminiRes = await fetch(geminiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ role: 'user', parts: [{ text: cmd.prompt }] }],
                        systemInstruction: { parts: [{ text: AGENT_PROMPT }] },
                        generationConfig: { responseMimeType: 'application/json', temperature: 0.3 }
                    })
                });

                if (!geminiRes.ok) return { ok: false, message: '❌ AI Agent 调用失败' };

                const data: any = await geminiRes.json();
                const responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!responseText) return { ok: false, message: '🤔 AI Agent 无响应' };

                let agentActions: any[] = [];
                try {
                    const parsed = JSON.parse(responseText);
                    agentActions = parsed.actions || [parsed];
                } catch {
                    return { ok: true, message: responseText };
                }

                // Recursively execute agent's actions
                const results: string[] = [];
                for (const subCmd of agentActions) {
                    const r = await executeAction(db, userId, subCmd, depth + 1);
                    results.push(r.message);
                }

                // Save agent execution as memory
                await saveMemory(db, userId, 'decision',
                    `AI Agent 执行 "${cmd.prompt}" → ${results.join('; ')}`,
                    3, ['ai-agent'], 'cron');

                return { ok: true, message: `🤖 AI Agent 完成:\n${results.join('\n')}` };
            }

            case 'navigate': {
                return { ok: true, message: `🔗 请在网页端访问: ${cmd.path}` };
            }

            case 'schedule_task': {
                const actionObj = cmd.scheduledAction || cmd.taskPayload || { action: 'reminder', message: cmd.title };
                await db.insert(scheduledTasks).values({
                    id: crypto.randomUUID(),
                    userId,
                    title: cmd.title || '定时任务',
                    triggerAt: cmd.triggerAt,
                    recurrence: cmd.recurrence || null,
                    actionType: actionObj.action || actionObj.type || 'reminder',
                    actionPayload: JSON.stringify(actionObj),
                    createdAt: Date.now(),
                });
                return { ok: true, message: `📅 已创建定时任务: "${cmd.title}"` };
            }

            case 'create_poll': {
                const pollId = crypto.randomUUID();
                await db.insert(polls).values({
                    id: pollId,
                    userId,
                    title: cmd.title,
                    description: cmd.description || null,
                    type: cmd.type,
                    accessCode: cmd.accessCode || null,
                    isActive: true,
                    createdAt: Date.now()
                });

                if (cmd.options && cmd.options.length > 0) {
                    await Promise.all(cmd.options.map((opt: string, idx: number) =>
                        db.insert(pollOptions).values({
                            id: crypto.randomUUID(),
                            pollId,
                            content: opt,
                            sortOrder: idx
                        })
                    ));
                }
                const url = `https://magic-ball.meshnet.sh/vote/${pollId}`;
                return { ok: true, message: `📊 投票 "${cmd.title}" 已创建完毕。\n👉 分享链接邀请大家参与：\n${url}` };
            }

            case 'chat': {
                return { ok: true, message: cmd.message || '好的' };
            }

            default:
                return { ok: false, message: `未知操作: ${cmd.action}` };
        }
    } catch (err: any) {
        return { ok: false, message: `❌ 执行出错: ${err.message}` };
    }
}

/**
 * Save a memory entry
 */
export async function saveMemory(
    db: ReturnType<typeof getDb>,
    userId: string,
    type: string,
    content: string,
    importance: number,
    tags: string[],
    source: string
): Promise<void> {
    await db.insert(aiMemories).values({
        id: crypto.randomUUID(),
        userId,
        type,
        content,
        importance,
        tags: JSON.stringify(tags),
        source,
        createdAt: Date.now(),
    });
}

/**
 * Save a system or AI message for the UI to display persistently
 */
export async function saveSystemMessage(
    db: ReturnType<typeof getDb>,
    userId: string,
    content: string,
    source: 'system' | 'ai' = 'system'
): Promise<void> {
    await db.insert(messages).values({
        id: crypto.randomUUID(),
        userId,
        content,
        source,
        createdAt: Date.now(),
    });
}

/**
 * Load recent memories for AI context injection
 */
export async function loadMemories(
    db: ReturnType<typeof getDb>,
    userId: string,
    limit: number = 15
): Promise<string> {
    const memories = await db.select().from(aiMemories)
        .where(eq(aiMemories.userId, userId))
        .orderBy(desc(aiMemories.importance), desc(aiMemories.createdAt))
        .limit(limit);

    if (memories.length === 0) return '';

    return '\n# 你的记忆\n' + memories.map(m => {
        const age = Date.now() - m.createdAt;
        const ageStr = age < 3600000 ? `${Math.floor(age / 60000)}分钟前`
            : age < 86400000 ? `${Math.floor(age / 3600000)}小时前`
                : `${Math.floor(age / 86400000)}天前`;
        return `- [${ageStr}] ${m.content}`;
    }).join('\n');
}
