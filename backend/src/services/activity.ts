import type { Activity, CreateActivityInput, UpdateActivityInput } from "@ryty/shared";
import type { AuthenticatedUser } from "../auth/session";
import { ENTRY_TYPES } from "@ryty/shared";
import type { Services } from "./services";
import { badRequest, forbidden, notFound, HttpError } from "../utils/http";
import { occurredOn, zonedTimeToUtc } from "../utils/time";

export interface OverlapCheck {
  overlapping: Activity[];
}

/** Seconds between two ISO instants. */
function diffSeconds(startIso: string, endIso: string): number {
  return Math.floor((Date.parse(endIso) - Date.parse(startIso)) / 1000);
}

/**
 * Access guard for a single activity: users may only touch their own
 * activities (admins included — they may view everything but not modify
 * other users' records).
 */
export async function getOwnedActivity(
  services: Services,
  user: AuthenticatedUser,
  id: number,
): Promise<Activity> {
  const activity = await services.activities.findById(id);
  if (!activity) throw notFound("activity_not_found", "Activity not found");
  if (activity.userId !== user.id) {
    throw forbidden("not_owner", "You can only access your own activities");
  }
  return activity;
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
    return services.activities.create({
      userId: user.id,
      title: input.title,
      description: input.description ?? null,
      entryType: ENTRY_TYPES.RANGE,
      startedAt: startUtc.toISOString(),
      endedAt: endUtc.toISOString(),
      durationSeconds,
      occurredOn: occurredOn(startUtc, appTimezone),
    });
  }

  // Duration-only entry: no timestamps, local grouping date required.
  const date = input.occurredOn ?? occurredOn(new Date(), appTimezone);
  return services.activities.create({
    userId: user.id,
    title: input.title,
    description: input.description ?? null,
    entryType: ENTRY_TYPES.DURATION,
    startedAt: null,
    endedAt: null,
    durationSeconds: input.durationSeconds,
    occurredOn: date,
  });
}

/** Update an owned activity with validated client input. */
export async function updateActivity(
  services: Services,
  user: AuthenticatedUser,
  id: number,
  input: UpdateActivityInput,
  appTimezone: string,
): Promise<Activity> {
  const existing = await getOwnedActivity(services, user, id);
  const patch: Parameters<Services["activities"]["update"]>[1] = {};

  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description ?? null;

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
      user.id,
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
  void existing;
  return updated;
}
