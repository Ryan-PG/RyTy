import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";

/**
 * Drizzle schema shared by both deployment targets.
 *
 * Timestamps are stored as ISO-8601 UTC strings; durations as integer
 * seconds; `occurred_on` as a local calendar date (YYYY-MM-DD) derived in
 * the application timezone.
 */

export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  visibility: text("visibility").notNull(), // "public" | "private"
  status: text("status").notNull(), // "active" | "suggested"
  createdBy: integer("created_by")
    .notNull()
    .references((): AnySQLiteColumn => users.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [
  uniqueIndex("idx_projects_name").on(t.name),
  index("idx_projects_visibility").on(t.visibility, t.status),
  index("idx_projects_created_by").on(t.createdBy),
]);

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull(), // "admin" | "user"
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  mustChangePassword: integer("must_change_password", { mode: "boolean" })
    .notNull()
    .default(false),
  // Personal UI preferences (null = inherit application defaults).
  language: text("language"),
  theme: text("theme"),
  timezone: text("timezone"),
  defaultProjectId: integer("default_project_id").references(
    (): AnySQLiteColumn => projects.id,
    { onDelete: "set null" },
  ),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [
  uniqueIndex("idx_users_username").on(t.username),
]);

export const tags = sqliteTable("tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  createdBy: integer("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull(),
}, (t) => [
  uniqueIndex("idx_tags_name").on(t.name),
]);

export const activities = sqliteTable("activities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  entryType: text("entry_type").notNull(), // "timer" | "range" | "duration"
  startedAt: text("started_at"), // null for duration-only entries
  endedAt: text("ended_at"),
  durationSeconds: integer("duration_seconds").notNull(),
  occurredOn: text("occurred_on").notNull(), // YYYY-MM-DD (app timezone)
  projectId: integer("project_id").references(() => projects.id, {
    onDelete: "set null",
  }),
  /** Soft delete: set when the row is deleted; never surfaced again. */
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [
  index("idx_activities_user_occurred").on(t.userId, t.occurredOn),
  index("idx_activities_started").on(t.startedAt),
  index("idx_activities_ended").on(t.endedAt),
  index("idx_activities_project").on(t.projectId),
  index("idx_activities_deleted").on(t.deletedAt),
]);

/** Many-to-many between activities and public tags. */
export const activityTags = sqliteTable("activity_tags", {
  activityId: integer("activity_id")
    .notNull()
    .references(() => activities.id, { onDelete: "cascade" }),
  tagId: integer("tag_id")
    .notNull()
    .references(() => tags.id, { onDelete: "cascade" }),
}, (t) => [
  index("idx_activity_tags_tag").on(t.tagId),
]);

/**
 * Co-doers ("co-operators") attached to an activity by its owner. The
 * activity owner is always `activities.user_id`; co-doers gain read access
 * to the activity, while editing stays with the owner.
 */
export const activityCoops = sqliteTable("activity_coops", {
  activityId: integer("activity_id")
    .notNull()
    .references(() => activities.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull(),
}, (t) => [
  index("idx_activity_coops_user").on(t.userId),
]);

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
}, (t) => [
  uniqueIndex("idx_sessions_token_hash").on(t.tokenHash),
  index("idx_sessions_expires").on(t.expiresAt),
]);

/**
 * One row per user's active timer. `segment_started_at` is the start of the
 * current running segment (null while paused). Stopping a timer converts it
 * into an activity row and deletes the timer row. Tags chosen at start are
 * kept as a JSON array of names and converted on stop.
 */
export const timers = sqliteTable("timers", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  state: text("state").notNull(), // "running" | "paused"
  segmentStartedAt: text("segment_started_at"),
  accumulatedSeconds: integer("accumulated_seconds").notNull().default(0),
  startedAt: text("started_at").notNull(), // first start (UTC ISO)
  projectId: integer("project_id").references(() => projects.id, {
    onDelete: "set null",
  }),
  tags: text("tags"), // JSON array of tag names
  /** JSON array of co-doer user ids chosen at start. */
  cooperatorIds: text("cooperator_ids"),
  updatedAt: text("updated_at").notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/** DB-backed login rate limiting (works on Workers and Node alike). */
export const loginAttempts = sqliteTable("login_attempts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull(),
  ip: text("ip").notNull(),
  attemptedAt: text("attempted_at").notNull(),
}, (t) => [
  index("idx_login_attempts_lookup").on(t.username, t.ip, t.attemptedAt),
]);
