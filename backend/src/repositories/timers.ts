import { eq } from "drizzle-orm";
import { projects, timers } from "../database/schema";
import type { AppDatabase } from "../database/adapter";
import type { ActiveTimer, TimerState } from "@ryty/shared";

type TimerRow = typeof timers.$inferSelect;

function toTimer(row: TimerRow, projectName: string | null): ActiveTimer {
  const parseJsonArray = (raw: string | null): string[] => {
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
    } catch {
      return [];
    }
  };
  const parseJsonIds = (raw: string | null): number[] => {
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((t): t is number => typeof t === "number") : [];
    } catch {
      return [];
    }
  };
  return {
    userId: row.userId,
    title: row.title,
    description: row.description,
    state: row.state as TimerState,
    segmentStartedAt: row.segmentStartedAt,
    accumulatedSeconds: row.accumulatedSeconds,
    startedAt: row.startedAt,
    project: row.projectId ? { id: row.projectId, name: projectName ?? "" } : null,
    tags: parseJsonArray(row.tags),
    cooperatorIds: parseJsonIds(row.cooperatorIds),
  };
}

export interface CreateTimerInput {
  userId: number;
  title: string;
  description: string | null;
  startedAt: string;
  projectId: number | null;
  tagNames: string[];
  cooperatorIds: number[];
}

export function createTimerRepository(db: AppDatabase) {
  return {
    async findByUserId(userId: number): Promise<ActiveTimer | null> {
      const [row] = await db
        .select({ timer: timers, projectName: projects.name })
        .from(timers)
        .leftJoin(projects, eq(projects.id, timers.projectId))
        .where(eq(timers.userId, userId))
        .limit(1);
      return row ? toTimer(row.timer, row.projectName) : null;
    },

    async create(input: CreateTimerInput): Promise<ActiveTimer> {
      const [row] = await db
        .insert(timers)
        .values({
          userId: input.userId,
          title: input.title,
          description: input.description,
          state: "running",
          segmentStartedAt: input.startedAt,
          accumulatedSeconds: 0,
          startedAt: input.startedAt,
          projectId: input.projectId,
          tags: input.tagNames.length > 0 ? JSON.stringify(input.tagNames) : null,
          cooperatorIds:
            input.cooperatorIds.length > 0 ? JSON.stringify(input.cooperatorIds) : null,
          updatedAt: input.startedAt,
        })
        .returning();
      return toTimer(row, null);
    },

    /** Accumulate the running segment and switch to paused. */
    async pause(userId: number, now: string): Promise<ActiveTimer | null> {
      const timer = await this.findByUserId(userId);
      if (!timer || timer.state !== "running" || !timer.segmentStartedAt) return timer;
      const elapsed = Math.max(0, Math.floor((Date.parse(now) - Date.parse(timer.segmentStartedAt)) / 1000));
      const [row] = await db
        .update(timers)
        .set({
          state: "paused",
          segmentStartedAt: null,
          accumulatedSeconds: timer.accumulatedSeconds + elapsed,
          updatedAt: now,
        })
        .where(eq(timers.userId, userId))
        .returning();
      return toTimer(row, timer.project?.name ?? null);
    },

    async resume(userId: number, now: string): Promise<ActiveTimer | null> {
      const timer = await this.findByUserId(userId);
      if (!timer) return null;
      const [row] = await db
        .update(timers)
        .set({ state: "running", segmentStartedAt: now, updatedAt: now })
        .where(eq(timers.userId, userId))
        .returning();
      return row ? toTimer(row, timer.project?.name ?? null) : null;
    },

    async delete(userId: number): Promise<void> {
      await db.delete(timers).where(eq(timers.userId, userId));
    },
  };
}

export type TimerRepository = ReturnType<typeof createTimerRepository>;
