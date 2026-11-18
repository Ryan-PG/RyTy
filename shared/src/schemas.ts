import { z } from "zod";
import {
  ACTIVITY_DESCRIPTION_MAX_LENGTH,
  ACTIVITY_TITLE_MAX_LENGTH,
  ENTRY_TYPES,
  LANGUAGES,
  MAX_PAGE_SIZE,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  REPORT_VISIBILITY,
  THEMES,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
} from "./constants";

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

const usernameSchema = z
  .string()
  .trim()
  .min(USERNAME_MIN_LENGTH)
  .max(USERNAME_MAX_LENGTH)
  .regex(/^[a-zA-Z0-9._-]+$/, "alphanumeric_username");

const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH)
  .max(PASSWORD_MAX_LENGTH);

/** Local calendar date, YYYY-MM-DD. */
const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalid_date");

/** Local wall-clock datetime without offset, YYYY-MM-DDTHH:mm. */
const localDatetimeSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "invalid_datetime");

const titleSchema = z
  .string()
  .trim()
  .min(1)
  .max(ACTIVITY_TITLE_MAX_LENGTH);

const descriptionSchema = z
  .string()
  .trim()
  .max(ACTIVITY_DESCRIPTION_MAX_LENGTH)
  .nullish();

const timezoneSchema = z.string().min(1).max(64);

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

export const loginSchema = z.object({
  username: z.string().min(1).max(USERNAME_MAX_LENGTH),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export const preferencesSchema = z.object({
  language: z.enum(LANGUAGES).optional(),
  theme: z.enum(THEMES).optional(),
  timezone: timezoneSchema.optional(),
});

export type PreferencesInput = z.infer<typeof preferencesSchema>;

/* ------------------------------------------------------------------ */
/* Timer                                                               */
/* ------------------------------------------------------------------ */

export const timerStartSchema = z.object({
  title: titleSchema,
  description: descriptionSchema,
});

/* ------------------------------------------------------------------ */
/* Activities                                                          */
/* ------------------------------------------------------------------ */

/**
 * Manual time-range entry. `start`/`end` are local wall-clock values that
 * the backend interprets in the application timezone.
 */
export const rangeActivitySchema = z.object({
  entryType: z.literal(ENTRY_TYPES.RANGE),
  title: titleSchema,
  description: descriptionSchema,
  start: localDatetimeSchema,
  end: localDatetimeSchema,
  allowOverlap: z.boolean().optional().default(false),
});

/** Manual duration entry. No timestamps are required. */
export const durationActivitySchema = z.object({
  entryType: z.literal(ENTRY_TYPES.DURATION),
  title: titleSchema,
  description: descriptionSchema,
  /** Duration in seconds, 1 second to 24 hours. */
  durationSeconds: z.number().int().min(1).max(24 * 60 * 60),
  /** Local grouping date (defaults to today in the application timezone). */
  occurredOn: localDateSchema.optional(),
});

/** Timer stop: client may pass the same title/description it started with. */
export const timerActivitySchema = z.object({
  entryType: z.literal(ENTRY_TYPES.TIMER),
  title: titleSchema.optional(),
  description: descriptionSchema,
});

export const createActivitySchema = z.discriminatedUnion("entryType", [
  rangeActivitySchema,
  durationActivitySchema,
  timerActivitySchema,
]);

export type CreateActivityInput = z.infer<typeof createActivitySchema>;

export const updateActivitySchema = z.object({
  title: titleSchema.optional(),
  description: descriptionSchema,
  /** Replacement local wall-clock range (range/timer entries only). */
  start: localDatetimeSchema.optional(),
  end: localDatetimeSchema.optional(),
  /** Replacement duration for duration-only entries. */
  durationSeconds: z.number().int().min(1).max(24 * 60 * 60).optional(),
  occurredOn: localDateSchema.optional(),
  allowOverlap: z.boolean().optional().default(false),
});

export type UpdateActivityInput = z.infer<typeof updateActivitySchema>;

export const activityListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  q: z.string().trim().max(200).optional(),
  from: localDateSchema.optional(),
  to: localDateSchema.optional(),
  /** Admin (or all_users visibility) only. */
  userId: z.coerce.number().int().positive().optional(),
});

export type ActivityListQuery = z.infer<typeof activityListQuerySchema>;

/* ------------------------------------------------------------------ */
/* Reports                                                             */
/* ------------------------------------------------------------------ */

const reportQuerySchema = z.object({
  from: localDateSchema,
  to: localDateSchema,
  userId: z.coerce.number().int().positive().optional(),
});

export const dailyReportQuerySchema = z.object({
  date: localDateSchema,
  userId: z.coerce.number().int().positive().optional(),
});

export const weeklyReportQuerySchema = z.object({
  /** Any date within the requested ISO week. */
  date: localDateSchema,
  userId: z.coerce.number().int().positive().optional(),
});

export const monthlyReportQuerySchema = z.object({
  /** Any date within the requested month, e.g. 2026-11-01. */
  date: localDateSchema,
  userId: z.coerce.number().int().positive().optional(),
});

export type ReportQueryInput = z.infer<typeof reportQuerySchema>;

export { reportQuerySchema };

/* ------------------------------------------------------------------ */
/* Admin                                                               */
/* ------------------------------------------------------------------ */

export const createUserSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  role: z.enum(["admin", "user"]),
});

export const updateUserSchema = z.object({
  username: usernameSchema.optional(),
  role: z.enum(["admin", "user"]).optional(),
  isActive: z.boolean().optional(),
});

export const resetPasswordSchema = z.object({
  /** Omit to let the server generate a secure random password. */
  password: passwordSchema.optional(),
});

export const updateSettingsSchema = z.object({
  appName: z.string().trim().min(1).max(100).optional(),
  defaultLanguage: z.enum(LANGUAGES).optional(),
  defaultTimezone: timezoneSchema.optional(),
  reportsVisibility: z.enum([REPORT_VISIBILITY.PRIVATE, REPORT_VISIBILITY.ALL_USERS]).optional(),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
