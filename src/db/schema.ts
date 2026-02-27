import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
});

export const ideas = sqliteTable("ideas", {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    type: text("type", { enum: ["text", "audio", "image"] }).notNull(),
    content: text("content").notNull(),
    tags: text("tags"), // Storing as JSON string
    createdAt: integer("created_at").notNull(),
});

// ========== Voting / Opinion Collector ==========

export const polls = sqliteTable("polls", {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    title: text("title").notNull(),
    description: text("description"),
    type: text("type", { enum: ["single_choice", "multi_choice", "open_text"] }).notNull(),
    accessCode: text("access_code"), // null = no restriction
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at").notNull(),
});

export const pollOptions = sqliteTable("poll_options", {
    id: text("id").primaryKey(),
    pollId: text("poll_id").notNull().references(() => polls.id),
    content: text("content").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
});

export const pollResponses = sqliteTable("poll_responses", {
    id: text("id").primaryKey(),
    pollId: text("poll_id").notNull().references(() => polls.id),
    optionId: text("option_id"), // null for open_text type
    textContent: text("text_content"), // for open_text responses
    fingerprint: text("fingerprint").notNull(), // browser fingerprint hash for anti-spam
    createdAt: integer("created_at").notNull(),
});

// ========== User Settings (AI Config etc.) ==========

export const userSettings = sqliteTable("user_settings", {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    key: text("key").notNull(),     // e.g. "gemini_api_key", "gemini_model"
    value: text("value").notNull(), // the setting value
});

// ========== Scheduler ==========

export const scheduledTasks = sqliteTable("scheduled_tasks", {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    title: text("title").notNull(),
    triggerAt: integer("trigger_at").notNull(),        // epoch ms — next trigger time
    recurrence: text("recurrence"),                     // null | "minutes:X" | "hours:X" | "daily" | "weekly" | "monthly"
    actionType: text("action_type").notNull(),          // quick filter: "create_idea" | "ai_agent" | "reminder" etc.
    actionPayload: text("action_payload").notNull().default("{}"), // full action JSON
    status: text("status").notNull().default("active"), // "active" | "paused" | "completed"
    lastTriggered: integer("last_triggered"),
    createdAt: integer("created_at").notNull(),
});

// ========== AI Memory ==========

export const aiMemories = sqliteTable("ai_memories", {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    type: text("type").notNull(),           // "conversation" | "fact" | "decision"
    content: text("content").notNull(),
    importance: integer("importance").notNull().default(3), // 1-5
    tags: text("tags").default("[]"),       // JSON array
    source: text("source").notNull(),       // "web" | "feishu" | "cron"
    createdAt: integer("created_at").notNull(),
});
