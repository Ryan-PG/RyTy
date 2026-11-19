import type { EntryType, Language, Role, Theme, TimerState } from "./constants";

/** User record as returned by the API (never contains secrets). */
export interface User {
  id: number;
  username: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  /** Personal UI preferences (null/undefined = inherit application defaults). */
  language?: Language | null;
  theme?: Theme | null;
  timezone?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Activity record as returned by the API. */
export interface Activity {
  id: number;
  userId: number;
  /** Populated by the API when reports visibility permits it. */
  username?: string;
  title: string;
  description: string | null;
  entryType: EntryType;
  /** ISO-8601 UTC, null for duration-only entries. */
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number;
  /** Local grouping date, YYYY-MM-DD, in the application timezone. */
  occurredOn: string;
  createdAt: string;
  updatedAt: string;
}

/** Active timer state as returned by the API. */
export interface ActiveTimer {
  userId: number;
  title: string;
  description: string | null;
  state: TimerState;
  /** ISO-8601 UTC timestamp of the current running segment start. */
  segmentStartedAt: string | null;
  /** Seconds accumulated by completed (paused) segments. */
  accumulatedSeconds: number;
  /** ISO-8601 UTC timestamp of the very first start. */
  startedAt: string;
}

export interface AuthUser extends User {
  /** Effective UI language preference (personal, else app default). */
  language: Language;
  /** Effective UI timezone preference (personal, else app default). */
  timezone: string;
  theme: Theme;
}

export interface AppSettings {
  appName: string;
  defaultLanguage: Language;
  defaultTimezone: string;
  reportsVisibility: "private" | "all_users";
}

export interface SetupStatus {
  /** True when at least one administrator exists. */
  adminExists: boolean;
  /** True when INITIAL_ADMIN_USERNAME / INITIAL_ADMIN_PASSWORD are configured. */
  bootstrapConfigured: boolean;
  /** The configured bootstrap username, when present. */
  bootstrapUsername: string | null;
}

export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ReportSummary {
  from: string;
  to: string;
  totalSeconds: number;
  activityCount: number;
  /** Aggregated per local day, ascending. */
  byDay: { date: string; totalSeconds: number; count: number }[];
  /** Aggregated per user (subject to visibility rules). */
  byUser: { userId: number; username: string; totalSeconds: number; count: number }[];
  /** Aggregated per activity title (top entries). */
  byTitle: { title: string; totalSeconds: number; count: number }[];
}
