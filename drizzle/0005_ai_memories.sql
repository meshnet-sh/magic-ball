CREATE TABLE ai_memories (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id),
    type        TEXT NOT NULL,
    content     TEXT NOT NULL,
    importance  INTEGER NOT NULL DEFAULT 3,
    tags        TEXT DEFAULT '[]',
    source      TEXT NOT NULL,
    created_at  INTEGER NOT NULL
);
