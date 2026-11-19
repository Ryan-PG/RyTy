-- RyTy schema: co-doers (co-operators) on activities. Compatible with both
-- Cloudflare D1 and SQLite. One migration file; statements applied in order.
CREATE TABLE activity_coops (
    activity_id INTEGER NOT NULL REFERENCES activities (id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (activity_id, user_id)
);
--> statement-breakpoint
CREATE INDEX idx_activity_coops_user ON activity_coops (user_id);
--> statement-breakpoint
ALTER TABLE timers ADD COLUMN cooperator_ids TEXT;
