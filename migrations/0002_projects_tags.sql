-- RyTy schema: projects & tags. Compatible with both Cloudflare D1 and
-- SQLite. One migration file; statements are applied in order.
CREATE TABLE projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    visibility TEXT NOT NULL DEFAULT 'private',
    status TEXT NOT NULL DEFAULT 'active',
    created_by INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_projects_name ON projects (name COLLATE NOCASE);
--> statement-breakpoint
CREATE INDEX idx_projects_visibility ON projects (visibility, status);
--> statement-breakpoint
CREATE INDEX idx_projects_created_by ON projects (created_by);
--> statement-breakpoint
CREATE TABLE tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_by INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_tags_name ON tags (name COLLATE NOCASE);
--> statement-breakpoint
CREATE TABLE activity_tags (
    activity_id INTEGER NOT NULL REFERENCES activities (id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
    PRIMARY KEY (activity_id, tag_id)
);
--> statement-breakpoint
CREATE INDEX idx_activity_tags_tag ON activity_tags (tag_id);
--> statement-breakpoint
ALTER TABLE activities ADD COLUMN project_id INTEGER REFERENCES projects (id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX idx_activities_project ON activities (project_id);
--> statement-breakpoint
ALTER TABLE timers ADD COLUMN project_id INTEGER REFERENCES projects (id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE timers ADD COLUMN tags TEXT;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN default_project_id INTEGER REFERENCES projects (id) ON DELETE SET NULL;
