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
  defaultProjectId?: number | null;
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
  project: { id: number; name: string } | null;
  /** Tag names attached to this activity. */
  tags: string[];
  /** Co-doers attached by the owner (never includes the owner). */
  cooperators: { id: number; username: string }[];
  createdAt: string;
  updatedAt: string;
}

/** Project record as returned by the API. */
export interface Project {
  id: number;
  name: string;
  description: string | null;
  visibility: "public" | "private";
  /** "suggested" projects await admin review before becoming public. */
  status: "active" | "suggested";
  createdBy: number;
  /** Populated by the API for admins and project owners. */
  creatorUsername?: string;
  createdAt: string;
  updatedAt: string;
}

/** Expense record as returned by the API. */
export interface Expense {
  id: number;
  userId: number;
  /** Populated by the API when the owner differs from the viewer. */
  username?: string;
  title: string;
  description: string | null;
  /** Amount in minor units (e.g. cents); divide by 100 for display. */
  amountMinor: number;
  /** Local grouping date, YYYY-MM-DD, in the application timezone. */
  occurredOn: string;
  createdAt: string;
  updatedAt: string;
}

/** Tag record as returned by the API. */
export interface Tag {
  id: number;
  name: string;
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
  project: { id: number; name: string } | null;
  /** Tag names chosen at start; applied to the activity on stop. */
  tags: string[];
  /** Co-doer user ids chosen at start; applied to the activity on stop. */
  cooperatorIds: number[];
}

export interface AuthUser extends User {
  /** Effective UI language preference (personal, else app default). */
  language: Language;
  /** Effective UI timezone preference (personal, else app default). */
  timezone: string;
  theme: Theme;
  /** The user's default project (must be one they can access). */
  defaultProjectId: number | null;
  /** Effective report visibility mode (personal scope vs. all users). */
  reportsVisibility: "private" | "all_users";
  /** Currency label for expense amounts (application-wide setting). */
  currency: string;
}

export interface AppSettings {
  appName: string;
  defaultLanguage: Language;
  defaultTimezone: string;
  reportsVisibility: "private" | "all_users";
  currency: string;
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
  /** Aggregated per project (untitled activities grouped as "No project"). */
  byProject: { projectId: number | null; projectName: string; totalSeconds: number; count: number }[];
  /** Aggregated per activity title (top entries). */
  byTitle: { title: string; totalSeconds: number; count: number }[];
}
