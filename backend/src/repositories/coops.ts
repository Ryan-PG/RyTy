import { and, eq, inArray } from "drizzle-orm";
import { activityCoops, users } from "../database/schema";
import type { AppDatabase } from "../database/adapter";

export interface Cooperator {
  id: number;
  username: string;
}

export function createCoopRepository(db: AppDatabase) {
  return {
    /** Co-doer usernames for a set of activities, keyed by activity id. */
    async cooperatorsForActivities(activityIds: number[]): Promise<Map<number, Cooperator[]>> {
      const map = new Map<number, Cooperator[]>();
      if (activityIds.length === 0) return map;
      const rows = await db
        .select({
          activityId: activityCoops.activityId,
          userId: users.id,
          username: users.username,
        })
        .from(activityCoops)
        .innerJoin(users, eq(users.id, activityCoops.userId))
        .where(inArray(activityCoops.activityId, activityIds))
        .orderBy(users.username);
      for (const row of rows) {
        const list = map.get(row.activityId) ?? [];
        list.push({ id: row.userId, username: row.username });
        map.set(row.activityId, list);
      }
      return map;
    },

    /** Replace the co-doer set of one activity. */
    async setForActivity(activityId: number, userIds: number[]): Promise<void> {
      await db.delete(activityCoops).where(eq(activityCoops.activityId, activityId));
      for (const userId of userIds) {
        await db
          .insert(activityCoops)
          .values({ activityId, userId, createdAt: new Date().toISOString() });
      }
    },

    /** Whether a user is a co-doer on an activity. */
    async exists(activityId: number, userId: number): Promise<boolean> {
      const [row] = await db
        .select({ userId: activityCoops.userId })
        .from(activityCoops)
        .where(and(eq(activityCoops.activityId, activityId), eq(activityCoops.userId, userId)))
        .limit(1);
      return Boolean(row);
    },
  };
}

export type CoopRepository = ReturnType<typeof createCoopRepository>;
