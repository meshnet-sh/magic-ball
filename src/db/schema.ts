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
