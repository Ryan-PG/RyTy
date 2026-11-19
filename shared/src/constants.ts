export const ROLES = {
  ADMIN: "admin",
  USER: "user",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ENTRY_TYPES = {
  TIMER: "timer",
  RANGE: "range",
  DURATION: "duration",
} as const;

export type EntryType = (typeof ENTRY_TYPES)[keyof typeof ENTRY_TYPES];

export const TIMER_STATES = {
  RUNNING: "running",
  PAUSED: "paused",
} as const;

export type TimerState = (typeof TIMER_STATES)[keyof typeof TIMER_STATES];

export const REPORT_VISIBILITY = {
  PRIVATE: "private",
  ALL_USERS: "all_users",
} as const;

export type ReportVisibility =
  (typeof REPORT_VISIBILITY)[keyof typeof REPORT_VISIBILITY];

export const PROJECT_VISIBILITY = {
  PUBLIC: "public",
  PRIVATE: "private",
} as const;

export type ProjectVisibility =
  (typeof PROJECT_VISIBILITY)[keyof typeof PROJECT_VISIBILITY];

export const PROJECT_STATUS = {
  ACTIVE: "active",
  SUGGESTED: "suggested",
} as const;

export type ProjectStatus =
  (typeof PROJECT_STATUS)[keyof typeof PROJECT_STATUS];

export const PROJECT_NAME_MAX_LENGTH = 80;
export const PROJECT_DESCRIPTION_MAX_LENGTH = 500;
export const TAG_NAME_MAX_LENGTH = 40;
export const MAX_TAGS_PER_ACTIVITY = 12;

/** Settings keys stored in the `settings` table with their default values. */
export const SETTINGS_DEFAULTS = {
  app_name: "RyTy",
  default_language: "en",
  default_timezone: "UTC",
  reports_visibility: REPORT_VISIBILITY.PRIVATE,
} as const;

export type SettingsKey = keyof typeof SETTINGS_DEFAULTS;

/** Supported UI languages. */
export const LANGUAGES = ["en", "fa"] as const;
export type Language = (typeof LANGUAGES)[number];

export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];

/** Maximum number of failed logins per username+IP within the window. */
export const LOGIN_RATE_LIMIT_MAX = 5;
/** Login rate-limit window in milliseconds (15 minutes). */
export const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

/** Password constraints. */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 40;

export const ACTIVITY_TITLE_MAX_LENGTH = 200;
export const ACTIVITY_DESCRIPTION_MAX_LENGTH = 2000;

/** Pagination defaults and caps. */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** Session lifetime in milliseconds (7 days). */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_COOKIE_NAME = "ryty_session";

/** A few common IANA timezones offered as quick picks in the UI. */
export const COMMON_TIMEZONES = [
  "UTC",
  "Asia/Tehran",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Istanbul",
  "Australia/Sydney",
] as const;
