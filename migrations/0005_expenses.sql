-- RyTy schema: expenses. Amounts are stored as integer minor units
-- (e.g. cents) to keep money exact. Soft delete matches activities.
-- Compatible with both Cloudflare D1 and SQLite.
CREATE TABLE expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    amount_minor INTEGER NOT NULL,
    occurred_on TEXT NOT NULL,
    deleted_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX idx_expenses_user_occurred ON expenses (user_id, occurred_on);
--> statement-breakpoint
CREATE INDEX idx_expenses_deleted ON expenses (deleted_at);
