-- RyTy initial schema. Compatible with both Cloudflare D1 and SQLite.
-- One migration file; statements are applied in order.
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    must_change_password INTEGER NOT NULL DEFAULT 0,
    language TEXT,
    theme TEXT,
    timezone TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_users_username ON users (username);
--> statement-breakpoint
CREATE TABLE activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    entry_type TEXT NOT NULL,
    started_at TEXT,
    ended_at TEXT,
    duration_seconds INTEGER NOT NULL,
    occurred_on TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX idx_activities_user_occurred ON activities (user_id, occurred_on);
--> statement-breakpoint
CREATE INDEX idx_activities_started ON activities (started_at);
--> statement-breakpoint
CREATE INDEX idx_activities_ended ON activities (ended_at);
--> statement-breakpoint
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_sessions_token_hash ON sessions (token_hash);
--> statement-breakpoint
CREATE INDEX idx_sessions_expires ON sessions (expires_at);
--> statement-breakpoint
CREATE TABLE timers (
    user_id INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    state TEXT NOT NULL,
    segment_started_at TEXT,
    accumulated_seconds INTEGER NOT NULL DEFAULT 0,
    started_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    ip TEXT NOT NULL,
    attempted_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX idx_login_attempts_lookup ON login_attempts (username, ip, attempted_at);
