import { ENTRY_TYPES, type ActiveTimer, type Activity } from "@ryty/shared";
import type { Services } from "./services";
import type { AuthenticatedUser } from "../auth/session";
import { badRequest, conflict, notFound } from "../utils/http";
import { occurredOn } from "../utils/time";
import { attachTags, canUseProject } from "./project";

/**
 * Timer business logic. The database is the single source of truth:
 * `started_at` anchors the timer, running segments are measured from
 * `segment_started_at`, and completed segments accumulate in
 * `accumulated_seconds`. Durations are always computed server-side.
 */

/** Total accumulated seconds of a timer at a given instant. */
export function timerElapsedSeconds(timer: ActiveTimer, nowIso = new Date().toISOString()): number {
  let total = timer.accumulatedSeconds;
  if (timer.state === "running" && timer.segmentStartedAt) {
    total += Math.max(0, Math.floor((Date.parse(nowIso) - Date.parse(timer.segmentStartedAt)) / 1000));
  }
  return total;
}

export async function startTimer(
  services: Services,
  user: AuthenticatedUser,
  title: string,
  description: string | null,
  projectId: number | null,
  tagNames: string[] | undefined,
): Promise<ActiveTimer> {
  const existing = await services.timers.findByUserId(user.id);
  if (existing) {
    throw conflict("timer_already_active", "Stop the active timer before starting a new one");
  }
  const now = new Date().toISOString();
  const resolvedProjectId =
    projectId != null ? (await canUseProject(services, user, projectId)).id : null;
  const tags = tagNames ? (await services.tags.ensureMany(tagNames, user.id)).map((t) => t.name) : [];
  return services.timers.create({
    userId: user.id,
    title,
    description,
    startedAt: now,
    projectId: resolvedProjectId,
    tagNames: tags,
  });
}

export async function pauseTimer(services: Services, user: AuthenticatedUser): Promise<ActiveTimer> {
  const timer = await services.timers.findByUserId(user.id);
  if (!timer) throw notFound("timer_not_active", "No active timer");
  if (timer.state === "paused") return timer; // idempotent
  const paused = await services.timers.pause(user.id, new Date().toISOString());
  if (!paused) throw notFound("timer_not_active", "No active timer");
  return paused;
}

export async function resumeTimer(services: Services, user: AuthenticatedUser): Promise<ActiveTimer> {
  const timer = await services.timers.findByUserId(user.id);
  if (!timer) throw notFound("timer_not_active", "No active timer");
  if (timer.state === "running") return timer; // idempotent
  const resumed = await services.timers.resume(user.id, new Date().toISOString());
  if (!resumed) throw notFound("timer_not_active", "No active timer");
  return resumed;
}

/** Stop the timer and convert it into a final activity row. */
export async function stopTimer(
  services: Services,
  user: AuthenticatedUser,
  overrides: { title?: string; description?: string | null },
  appTimezone: string,
): Promise<Activity> {
  const timer = await services.timers.findByUserId(user.id);
  if (!timer) throw notFound("timer_not_active", "No active timer");
  const now = new Date().toISOString();
  const durationSeconds = timerElapsedSeconds(timer, now);
  if (durationSeconds < 1) {
    throw badRequest("timer_too_short", "The timer ran for less than a second");
  }
  const activity = await services.activities.create({
    userId: user.id,
    title: overrides.title ?? timer.title,
    description: overrides.description !== undefined ? overrides.description : timer.description,
    entryType: ENTRY_TYPES.TIMER,
    startedAt: timer.startedAt,
    endedAt: now,
    durationSeconds,
    occurredOn: occurredOn(timer.startedAt, appTimezone),
    projectId: timer.project?.id ?? null,
  });
  await attachTags(services, user.id, activity.id, timer.tags);
  await services.timers.delete(user.id);
  return (await services.activities.findById(activity.id)) ?? activity;
}
