import { getDb } from '@/db/index';
import { ideas, scheduledTasks, userSettings, aiMemories, messages, polls, pollOptions, users } from '@/db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { triggerN8nWorkflow } from './n8n';

export interface ActionResult {
    ok: boolean;
    message: string;
}

/**
 * Unified System Prompt for all Magic Ball AI Interactions
 * Ensures Web UI and Feishu Webhooks share the exact same capabilities.
 */
export function getSystemPrompt(): string {
    return `你是 Magic Ball 工具箱的 AI 助手。用户通过语音、纯文本或图文与你对话，你需要理解意图并返回**严格合法的 JSON 命令**。

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
- **能力**: 创建定时/重复任务（可触发任意插件或唤醒AI），查看任务列表，取消任务
- **交互策略**: 如果用户提到的时间非常模糊产生强烈歧义，请先使用 chat 询问确认。但如果用户描述的时间意图明确（比如：“提醒我明天开会”，“每天早上叫我起床”），**请直接创建任务，并附带一句简短的 chat 告诉用户已设置好**，不需要啰嗦反问确认。
- **创建定时任务**:
\`\`\`json
{"action": "schedule_task", "title": "任务名称", "triggerAt": 1709110800000, "recurrence": null, "scheduledAction": {"action": "reminder", "message": "提醒内容"}}
\`\`\`
- triggerAt: **epoch 毫秒时间戳**
- recurrence: null(一次性) | "minutes:X"(每X分钟) | "hours:X"(每X小时) | "daily" | "weekly" | "monthly"
- scheduledAction: **要执行的完整 action 对象**，可以是任何插件操作:
  - {"action": "reminder", "message": "..."} — 提醒
  - {"action": "create_idea", "content": "...", "tags": [...]} — 创建笔记
  - {"action": "ai_agent", "prompt": "..."} — **唤醒AI自主决策**
- **兼容旧字段**: 也可用 taskAction + taskPayload
- **AI Agent 工作流示例**: 用户说"帮我做一个每日工作流"时，创建多个定时任务:
\`\`\`json
{"action": "schedule_task", "title": "每日AI总结", "triggerAt": epoch_ms, "recurrence": "daily", "scheduledAction": {"action": "ai_agent", "prompt": "总结我今天创建的所有笔记，生成一份日报并记录为笔记"}}
\`\`\`

## 5. 页面导航 (navigate)
- **能力**: 跳转到工具箱内的页面
- **命令格式**:
\`\`\`json
{"action": "navigate", "path": "/tools/ideas"}
\`\`\`
- 可用路径: "/tools/ideas" (闪念笔记), "/tools/polls" (投票管理), "/tools/scheduler" (日程调度), "/settings" (设置)

## 6. 外部自动化 (external_workflow)
- **能力**: 触发后端的外部自动化工作流（如 n8n），用来完成“发邮件”、“爬网页”、“处理特定任务”等超纲要求。
- **命令格式**:
\`\`\`json
{"action": "trigger_external_workflow", "event": "事件名(英文或拼音)", "payload": {"参数名": "参数值"}}
\`\`\`
- **特殊严格要求 - 发邮件**: 如果用户明确要求发邮件，必须严格且唯一使用以下 payload 结构 (包含 to, subject, body)：
\`\`\`json
{"action": "trigger_external_workflow", "event": "send_email", "payload": {"to": "目标邮箱地址", "subject": "邮件标题(简短准确)", "body": "按要求生成的邮件正文详情(可使用html或普通文本)"}}
\`\`\`
- **示例输入**: "帮我发邮件给 tony@163.com，告诉他明天不上班"
- **示例输出**:
\`\`\`json
{"action": "trigger_external_workflow", "event": "send_email", "payload": {"to": "tony@163.com", "subject": "明天不上班通知", "body": "Tony你好，在此通知你明天不需要来上班。"}}
\`\`\`

## 7. 通用对话 (chat)
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
    {"action": "trigger_external_workflow", "event": "...", "payload": {...}}
  ]
}
\`\`\`
- **actions 是数组**: 如果用户一次说了多个任务，每个任务对应一个 action 对象，按顺序放入 actions 数组。如果只有一个任务，数组也只有一个元素。
- transcript 仅在处理语音时填写，文字输入时填 null。

# 严格规则
1. **始终且只返回上述格式的合法 JSON 对象**，禁止在 JSON 外添加任何文字、解释或 markdown 标记。
2. 多个任务必须拆分为独立 action 分别放入 actions 数组。
3. 如果你不确定用户想做什么，用 chat 类型回复并**列出你能做的事情**。
4. tags 中的标签**不要**带 # 号前缀。
5. Если前一次执行失败了，用户可能会把错误信息告诉你，请根据错误信息调整你的命令重试。
6. 用中文回复 chat 消息。`;
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

                // Get user settings (model, etc)
                const settings = await db.select().from(userSettings)
                    .where(eq(userSettings.userId, userId));
                const settingsMap: Record<string, string> = {};
                settings.forEach(s => { settingsMap[s.key] = s.value; });

                let apiKey = settingsMap['gemini_api_key'];
                const model = settingsMap['gemini_model'] || 'gemini-2.0-flash';

                // If user has no API key, borrow the admin's key
                if (!apiKey) {
                    const ADMIN_EMAIL = 'meshnet@163.com';
                    const adminUser = await db.select().from(users).where(eq(users.email, ADMIN_EMAIL)).get();
                    if (adminUser) {
                        const adminSettings = await db.select().from(userSettings)
                            .where(and(eq(userSettings.userId, adminUser.id), eq(userSettings.key, 'gemini_api_key'))).get();
                        if (adminSettings) {
                            apiKey = adminSettings.value;
                        }
                    }
                }

                if (!apiKey) return { ok: false, message: '⚠️ 系统缺少全局或个人的 Gemini API Key，AI 任务被跳过。' };

                const AGENT_PROMPT = `你是 Magic Ball AI Agent。你被定时任务唤醒来执行一个任务。
分析下面的上下文和任务提示，然后返回要执行的 actions 数组。

**【极度重要规则】**
严格且仅基于以下提供的上下文（你的局部小世界）进行总结、回忆或回答。如果在此上下文中没有找到相关信息，请如实说明“近期内部没有相关记录”，**绝对禁止**使用你自带的各种大模型维基数据或外部新闻事实来编造外部世界的"大事件"以作为敷衍。

可用 actions:
- {"action": "create_idea", "content": "...", "tags": [...]}
- {"action": "reminder", "message": "..."}
- {"action": "schedule_task", "title": "...", "triggerAt": epoch_ms, "recurrence": "...", "scheduledAction": {...}}
- {"action": "trigger_external_workflow", "event": "...", "payload": {"key": "value"}}
  *重要附则*：如果意图是发送邮件，必须严格遵守此结构：
  {"action": "trigger_external_workflow", "event": "send_email", "payload": {"to": "邮箱地址", "subject": "标题", "body": "邮件正文"}}
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
                const url = `https://magic-ball.meshnets.org/vote/${pollId}`;
                return { ok: true, message: `📊 投票 "${cmd.title}" 已创建完毕。\n👉 分享链接邀请大家参与：\n${url}` };
            }

            case 'chat': {
                return { ok: true, message: cmd.message || '好的' };
            }

            case 'trigger_external_workflow': {
                try {
                    await triggerN8nWorkflow(db, userId, cmd.event || 'default_event', cmd.payload || {});
                    return { ok: true, message: `🚀 已触发外部自动化工作流: ${cmd.event || 'default_event'}` };
                } catch (e: any) {
                    return { ok: false, message: `❌ 触发外部工作流失败: ${e.message}` };
                }
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

    // Forward to Feishu if bound
    try {
        const feishuSetting = await db.select().from(userSettings)
            .where(and(eq(userSettings.userId, userId), eq(userSettings.key, 'feishu_open_id')));
        if (feishuSetting.length > 0) {
            const { getAccessToken } = await import('@/lib/feishu');
            const token = await getAccessToken();
            await fetch('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    receive_id: feishuSetting[0].value,
                    content: JSON.stringify({ text: `[系统回复]\n${content}` }),
                    msg_type: 'text',
                }),
            });
        }
    } catch (e) {
        console.error("Failed to forward system message to Feishu:", e);
    }
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
