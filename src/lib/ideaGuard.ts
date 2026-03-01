export type IdeaGuardResult = {
    allowed: boolean;
    reason?: string;
};

const NEGATIVE_INTENT_WORDS = ['none', 'unknown', 'no', 'false', 'null', 'skip', '无需记录', '不记录'];

const EXPLICIT_RECORD_PATTERNS = [
    /记/,
    /录/,
    /存/,
    /备忘/,
    /note/i,
    /save/i,
    /memo/i,
];

const IDEA_LIKE_PATTERNS = [
    /灵感/,
    /想法/,
    /方案/,
    /草稿/,
    /总结/,
    /复盘/,
    /提纲/,
    /计划/,
    /观点/,
    /创意/,
];

export function isIdeaContentLike(content: string): boolean {
    const text = (content || '').trim();
    if (!text) return false;
    if (IDEA_LIKE_PATTERNS.some((p) => p.test(text))) return true;
    // Usually idea-like text is not too short and has some structure.
    if (text.length >= 16 && /[，。；：,\.\n]/.test(text)) return true;
    if (text.length >= 24) return true;
    return false;
}

export function evaluateCreateIdeaIntent(cmd: any): IdeaGuardResult {
    const content = String(cmd?.content || '').trim();
    if (!content) {
        return { allowed: false, reason: '缺少可记录内容' };
    }

    const rawIntent = cmd?.recordIntent;
    if (typeof rawIntent === 'boolean') {
        if (rawIntent) return { allowed: true };
    } else if (typeof rawIntent === 'string') {
        const normalized = rawIntent.trim().toLowerCase();
        if (normalized && !NEGATIVE_INTENT_WORDS.includes(normalized)) {
            return { allowed: true };
        }
    } else if (rawIntent && typeof rawIntent === 'object') {
        return { allowed: true };
    }

    const intentHints = [cmd?.intent, cmd?.userIntent, cmd?.noteIntent, cmd?.whyCreateIdea]
        .map((v) => String(v || '').trim())
        .filter(Boolean);
    if (intentHints.length > 0) {
        return { allowed: true };
    }

    if (EXPLICIT_RECORD_PATTERNS.some((p) => p.test(content))) {
        return { allowed: true };
    }

    if (isIdeaContentLike(content)) {
        return { allowed: true };
    }

    return {
        allowed: false,
        reason: '未检测到明确“要记录”意图，且内容不够像可沉淀的 idea',
    };
}
