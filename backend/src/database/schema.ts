import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Drizzle schema shared by both deployment targets.
 *
 * Timestamps are stored as ISO-8601 UTC strings; durations as integer
 * seconds; `occurred_on` as a local calendar date (YYYY-MM-DD) derived in
 * the application timezone.
 */

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
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [
  uniqueIndex("idx_users_username").on(t.username),
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
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [
  index("idx_activities_user_occurred").on(t.userId, t.occurredOn),
  index("idx_activities_started").on(t.startedAt),
  index("idx_activities_ended").on(t.endedAt),
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
 * into an activity row and deletes the timer row.
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
