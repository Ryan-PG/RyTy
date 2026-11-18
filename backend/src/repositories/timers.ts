import { eq } from "drizzle-orm";
import { timers } from "../database/schema";
import type { AppDatabase } from "../database/adapter";
import type { ActiveTimer, TimerState } from "@ryty/shared";

type TimerRow = typeof timers.$inferSelect;

function toTimer(row: TimerRow): ActiveTimer {
  return {
    userId: row.userId,
    title: row.title,
    description: row.description,
    state: row.state as TimerState,
    segmentStartedAt: row.segmentStartedAt,
    accumulatedSeconds: row.accumulatedSeconds,
    startedAt: row.startedAt,
  };
}

export interface CreateTimerInput {
  userId: number;
  title: string;
  description: string | null;
  startedAt: string;
}

export function createTimerRepository(db: AppDatabase) {
  return {
    async findByUserId(userId: number): Promise<ActiveTimer | null> {
      const [row] = await db.select().from(timers).where(eq(timers.userId, userId)).limit(1);
      return row ? toTimer(row) : null;
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
          updatedAt: input.startedAt,
        })
        .returning();
      return toTimer(row);
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
      return toTimer(row);
    },

    async resume(userId: number, now: string): Promise<ActiveTimer | null> {
      const [row] = await db
        .update(timers)
        .set({ state: "running", segmentStartedAt: now, updatedAt: now })
        .where(eq(timers.userId, userId))
        .returning();
      return row ? toTimer(row) : null;
    },

    async delete(userId: number): Promise<void> {
      await db.delete(timers).where(eq(timers.userId, userId));
    },
  };
}

export type TimerRepository = ReturnType<typeof createTimerRepository>;
