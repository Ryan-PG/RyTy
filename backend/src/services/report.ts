import type { AuthenticatedUser } from "../auth/session";
import type { Services } from "./services";
import { forbidden } from "../utils/http";
import {
  REPORT_VISIBILITY,
  type Activity,
  type ReportSummary,
} from "@ryty/shared";

/**
 * Report visibility: admins always see everything; regular users see only
 * their own data in "private" mode, everyone's data in "all_users" mode.
 * Returns null to mean "no user restriction" (all users).
 */
export async function resolveReportScope(
  services: Services,
  user: AuthenticatedUser,
  requestedUserId?: number,
): Promise<number[] | null> {
  const appSettings = await services.settings.getAppSettings();
  const isAdmin = user.role === "admin";
  const canSeeAll = isAdmin || appSettings.reportsVisibility === REPORT_VISIBILITY.ALL_USERS;

  if (!canSeeAll) {
    if (requestedUserId !== undefined && requestedUserId !== user.id) {
      throw forbidden("reports_private", "Report visibility is restricted to your own data");
    }
    return [user.id];
  }
  if (requestedUserId !== undefined) {
    return [requestedUserId];
  }
  return null; // all users
}

/** Aggregate activities into the standard report summary shape. */
export function summarizeActivities(
  from: string,
  to: string,
  activities: Activity[],
): ReportSummary {
  const byDay = new Map<string, { totalSeconds: number; count: number }>();
  const byUser = new Map<number, { username: string; totalSeconds: number; count: number }>();
  const byTitle = new Map<string, { totalSeconds: number; count: number }>();
  const byProject = new Map<string, { projectId: number | null; projectName: string; totalSeconds: number; count: number }>();

  let totalSeconds = 0;
  for (const activity of activities) {
    totalSeconds += activity.durationSeconds;

    const day = byDay.get(activity.occurredOn) ?? { totalSeconds: 0, count: 0 };
    day.totalSeconds += activity.durationSeconds;
    day.count += 1;
    byDay.set(activity.occurredOn, day);

    const userEntry = byUser.get(activity.userId) ?? {
      username: activity.username ?? `user#${activity.userId}`,
      totalSeconds: 0,
      count: 0,
    };
    userEntry.totalSeconds += activity.durationSeconds;
    userEntry.count += 1;
    byUser.set(activity.userId, userEntry);

    const titleEntry = byTitle.get(activity.title) ?? { totalSeconds: 0, count: 0 };
    titleEntry.totalSeconds += activity.durationSeconds;
    titleEntry.count += 1;
    byTitle.set(activity.title, titleEntry);

    const projectKey = activity.project?.id ?? "none";
    const projectEntry = byProject.get(String(projectKey)) ?? {
      projectId: activity.project?.id ?? null,
      projectName: activity.project?.name ?? "",
      totalSeconds: 0,
      count: 0,
    };
    projectEntry.totalSeconds += activity.durationSeconds;
    projectEntry.count += 1;
    byProject.set(String(projectKey), projectEntry);
  }

  return {
    from,
    to,
    totalSeconds,
    activityCount: activities.length,
    byDay: [...byDay.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, v]) => ({ date, ...v })),
    byUser: [...byUser.entries()]
      .map(([userId, v]) => ({ userId, ...v }))
      .sort((a, b) => b.totalSeconds - a.totalSeconds),
    byProject: [...byProject.values()].sort((a, b) => b.totalSeconds - a.totalSeconds),
    byTitle: [...byTitle.entries()]
      .map(([title, v]) => ({ title, ...v }))
      .sort((a, b) => b.totalSeconds - a.totalSeconds)
      .slice(0, 20),
  };
}

/** Escape a single CSV cell (RFC 4180, quotes doubled). */
export function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Build a UTF-8 CSV document (with BOM) from report activities. */
export function activitiesToCsv(activities: Activity[]): string {
  const header = [
    "occurred_on",
    "username",
    "project",
    "title",
    "description",
    "tags",
    "entry_type",
    "started_at_utc",
    "ended_at_utc",
    "duration_seconds",
    "duration_h_m",
  ];
  const lines = [header.map(csvEscape).join(",")];
  for (const a of activities) {
    const h = Math.floor(a.durationSeconds / 3600);
    const m = Math.floor((a.durationSeconds % 3600) / 60);
    lines.push(
      [
        a.occurredOn,
        a.username ?? String(a.userId),
        a.project?.name ?? "",
        a.title,
        a.description ?? "",
        a.tags.join(" "),
        a.entryType,
        a.startedAt ?? "",
        a.endedAt ?? "",
        String(a.durationSeconds),
        `${h}:${String(m).padStart(2, "0")}`,
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  // BOM so Excel opens Persian text correctly.
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}
