import type { Activity, CreateActivityInput, UpdateActivityInput } from "@ryty/shared";
import type { AuthenticatedUser } from "../auth/session";
import { ENTRY_TYPES } from "@ryty/shared";
import type { Services } from "./services";
import { badRequest, forbidden, notFound, HttpError } from "../utils/http";
import { occurredOn, zonedTimeToUtc } from "../utils/time";
import { attachTags, canUseProject } from "./project";

/** Validate and normalize co-doer ids: active users only, owner removed. */
async function resolveCooperators(
  services: Services,
  ownerId: number,
  cooperatorIds: number[] | undefined,
): Promise<number[]> {
  if (!cooperatorIds || cooperatorIds.length === 0) return [];
  const unique = [...new Set(cooperatorIds)].filter((id) => id !== ownerId);
  if (unique.length === 0) return [];
  const found = await services.users.findActiveByIds(unique);
  return found.map((u) => u.id);
}

/** Attach (creating if needed) tags to an activity. */

export interface OverlapCheck {
  overlapping: Activity[];
}

/** Seconds between two ISO instants. */
function diffSeconds(startIso: string, endIso: string): number {
  return Math.floor((Date.parse(endIso) - Date.parse(startIso)) / 1000);
}

/**
 * Attach tag names and co-doers to a set of activities (two batched
 * queries, no N+1). Mutates and returns the same array for convenience.
 */
export async function hydrateActivities(services: Services, activities: Activity[]): Promise<Activity[]> {
  if (activities.length === 0) return activities;
  const ids = activities.map((a) => a.id);
  const [tagMap, coopMap] = await Promise.all([
    services.tags.namesForActivities(ids),
    services.coops.cooperatorsForActivities(ids),
  ]);
  for (const activity of activities) {
    activity.tags = tagMap.get(activity.id) ?? [];
    activity.cooperators = coopMap.get(activity.id) ?? [];
  }
  return activities;
}

/**
 * Access guard for reading one activity: the owner and any co-doer may
 * view it. Returns whether the viewer is the owner (mutations are
 * owner-only).
 */
export async function getActivityForView(
  services: Services,
  user: AuthenticatedUser,
  id: number,
): Promise<{ activity: Activity; isOwner: boolean }> {
  const activity = await services.activities.findById(id);
  if (!activity) throw notFound("activity_not_found", "Activity not found");
  if (activity.userId !== user.id) {
    const isCoop = await services.coops.exists(id, user.id);
    if (!isCoop) {
      throw forbidden("not_owner", "You can only access your own activities");
    }
    // Co-doers see the owner's username for context.
    const owner = await services.users.findById(activity.userId);
    if (owner) activity.username = owner.username;
  }
  return { activity, isOwner: activity.userId === user.id };
}

/** Overlap check for a half-open [start, end) interval of one user. */
export async function checkOverlap(
  services: Services,
  userId: number,
  startIso: string,
  endIso: string,
  excludeActivityId?: number,
): Promise<OverlapCheck> {
  const overlapping = await services.activities.findOverlaps(
    userId,
    startIso,
    endIso,
    excludeActivityId,
  );
  return { overlapping };
}

function assertNoOverlapUnlessAllowed(
  overlap: OverlapCheck,
  allowOverlap: boolean,
): void {
  if (overlap.overlapping.length > 0 && !allowOverlap) {
    throw new HttpError(409, "activity_overlap", "The time range overlaps existing activities", {
      overlapping: overlap.overlapping,
    });
  }
}

/** Create an activity from validated client input. */
export async function createActivity(
  services: Services,
  user: AuthenticatedUser,
  input: CreateActivityInput,
  appTimezone: string,
): Promise<Activity> {
  if (input.entryType === ENTRY_TYPES.TIMER) {
    throw badRequest("timer_use_endpoints", "Timer activities are created via the timer endpoints");
  }

  // Project (optional): must be one the user can access.
  let projectId: number | null = null;
  if (input.projectId != null) {
    projectId = (await canUseProject(services, user, input.projectId)).id;
  }

  if (input.entryType === ENTRY_TYPES.RANGE) {
    const startUtc = zonedTimeToUtc(input.start, appTimezone);
    const endUtc = zonedTimeToUtc(input.end, appTimezone);
    if (!startUtc || !endUtc) throw badRequest("invalid_datetime", "Invalid start or end time");
    const durationSeconds = diffSeconds(startUtc.toISOString(), endUtc.toISOString());
    if (durationSeconds <= 0) {
      throw badRequest("invalid_range", "The end time must be after the start time");
    }
    const overlap = await checkOverlap(
      services,
      user.id,
      startUtc.toISOString(),
      endUtc.toISOString(),
    );
    assertNoOverlapUnlessAllowed(overlap, input.allowOverlap ?? false);
    const activity = await services.activities.create({
      userId: user.id,
      title: input.title,
      description: input.description ?? null,
      entryType: ENTRY_TYPES.RANGE,
      startedAt: startUtc.toISOString(),
      endedAt: endUtc.toISOString(),
      durationSeconds,
      occurredOn: occurredOn(startUtc, appTimezone),
      projectId,
    });
    await attachTags(services, user.id, activity.id, input.tags);
    await services.coops.setForActivity(
      activity.id,
      await resolveCooperators(services, user.id, input.cooperatorIds),
    );
    return (await services.activities.findById(activity.id)) ?? activity;
  }

  // Duration-only entry: no timestamps, local grouping date required.
  const date = input.occurredOn ?? occurredOn(new Date(), appTimezone);
  const activity = await services.activities.create({
    userId: user.id,
    title: input.title,
    description: input.description ?? null,
    entryType: ENTRY_TYPES.DURATION,
    startedAt: null,
    endedAt: null,
    durationSeconds: input.durationSeconds,
    occurredOn: date,
    projectId,
  });
  await attachTags(services, user.id, activity.id, input.tags);
  await services.coops.setForActivity(
    activity.id,
    await resolveCooperators(services, user.id, input.cooperatorIds),
  );
  return (await services.activities.findById(activity.id)) ?? activity;
}

/** Update an activity the viewer owns or is a co-doer of. */
export async function updateActivity(
  services: Services,
  user: AuthenticatedUser,
  id: number,
  input: UpdateActivityInput,
  appTimezone: string,
): Promise<Activity> {
  // The owner and any co-doer may edit; overlap is checked against the
  // owner's timeline, and co-doer membership is resolved for the owner.
  const existing = (await getActivityForView(services, user, id)).activity;
  const ownerId = existing.userId;
  const patch: Parameters<Services["activities"]["update"]>[1] = {};

  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description ?? null;
  if (input.projectId !== undefined) {
    patch.projectId =
      input.projectId === null ? null : (await canUseProject(services, user, input.projectId)).id;
  }

  if (input.durationSeconds !== undefined) {
    if (existing.entryType === ENTRY_TYPES.DURATION) {
      patch.durationSeconds = input.durationSeconds;
    } else {
      throw badRequest(
        "duration_not_editable",
        "Only duration-only activities accept a duration override",
      );
    }
  }

  if (input.start || input.end) {
    if (existing.entryType === ENTRY_TYPES.DURATION) {
      throw badRequest("range_not_editable", "Duration-only activities have no time range");
    }
    if (!input.start || !input.end) {
      throw badRequest("range_required", "Both start and end are required to change the time range");
    }
    const startUtc = zonedTimeToUtc(input.start, appTimezone);
    const endUtc = zonedTimeToUtc(input.end, appTimezone);
    if (!startUtc || !endUtc) throw badRequest("invalid_datetime", "Invalid start or end time");
    if (endUtc <= startUtc) {
      throw badRequest("invalid_range", "The end time must be after the start time");
    }
    const overlap = await checkOverlap(
      services,
      ownerId,
      startUtc.toISOString(),
      endUtc.toISOString(),
      id,
    );
    assertNoOverlapUnlessAllowed(overlap, input.allowOverlap ?? false);
    patch.startedAt = startUtc.toISOString();
    patch.endedAt = endUtc.toISOString();
    patch.durationSeconds = diffSeconds(patch.startedAt, patch.endedAt!);
  }

  if (input.occurredOn !== undefined) {
    patch.occurredOn = input.occurredOn;
  } else if (patch.startedAt) {
    patch.occurredOn = occurredOn(patch.startedAt, appTimezone);
  }

  const updated = await services.activities.update(id, patch);
  if (!updated) throw notFound("activity_not_found", "Activity not found");
  if (input.tags !== undefined) {
    await attachTags(services, user.id, id, input.tags);
  }
  if (input.cooperatorIds !== undefined) {
    await services.coops.setForActivity(
      id,
      await resolveCooperators(services, ownerId, input.cooperatorIds),
    );
  }
  void existing;
  return (await services.activities.findById(id)) ?? updated;
}
