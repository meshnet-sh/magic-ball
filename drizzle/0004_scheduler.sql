CREATE TABLE scheduled_tasks (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id),
    title           TEXT NOT NULL,
    trigger_at      INTEGER NOT NULL,
    recurrence      TEXT,
    action_type     TEXT NOT NULL,
    action_payload  TEXT NOT NULL DEFAULT '{}',
    status          TEXT NOT NULL DEFAULT 'active',
    last_triggered  INTEGER,
    created_at      INTEGER NOT NULL
);
