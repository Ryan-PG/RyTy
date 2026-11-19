-- RyTy schema: soft delete for activities. Deleted activities keep their
-- row (audit/recovery) but are hidden from every query. Compatible with
-- both Cloudflare D1 and SQLite.
ALTER TABLE activities ADD COLUMN deleted_at TEXT;
--> statement-breakpoint
CREATE INDEX idx_activities_deleted ON activities (deleted_at);
