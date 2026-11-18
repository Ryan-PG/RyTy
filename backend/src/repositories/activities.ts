import { and, asc, count, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import { activities, users } from "../database/schema";
import type { AppDatabase } from "../database/adapter";
import type { Activity, ActivityListQuery, EntryType } from "@ryty/shared";

type ActivityRow = typeof activities.$inferSelect;

function toActivity(row: ActivityRow, username?: string | null): Activity {
  const activity: Activity = {
    id: row.id,
    userId: row.userId,
    title: row.title,
    description: row.description,
    entryType: row.entryType as EntryType,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    durationSeconds: row.durationSeconds,
    occurredOn: row.occurredOn,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  if (username) activity.username = username;
  return activity;
}

export interface CreateActivityInput {
  userId: number;
  title: string;
  description: string | null;
  entryType: EntryType;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number;
  occurredOn: string;
}

export interface UpdateActivityPatch {
  title?: string;
  description?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  durationSeconds?: number;
  occurredOn?: string;
}

export function createActivityRepository(db: AppDatabase) {
  return {
    async findById(id: number): Promise<Activity | null> {
      const [row] = await db.select().from(activities).where(eq(activities.id, id)).limit(1);
      return row ? toActivity(row) : null;
    },

    async findByIdWithUser(id: number): Promise<Activity | null> {
      const [row] = await db
        .select({ activity: activities, username: users.username })
        .from(activities)
        .leftJoin(users, eq(users.id, activities.userId))
        .where(eq(activities.id, id))
        .limit(1);
      return row ? toActivity(row.activity, row.username) : null;
    },

    /**
     * List activities with filters and pagination.
     * `userIds` is the access-scoped list: pass null to allow every user.
     */
    async list(
      query: ActivityListQuery,
      userIds: number[] | null,
    ): Promise<{ data: Activity[]; total: number }> {
      const page = query.page ?? 1;
      const pageSize = query.pageSize ?? 20;
      const conditions = [];
      if (userIds && userIds.length > 0) {
        conditions.push(
          sql`${activities.userId} IN (${sql.join(userIds.map((id) => sql`${id}`), sql`, `)})`,
        );
      } else if (userIds && userIds.length === 0) {
        return { data: [], total: 0 };
      }
      if (query.q) {
        const pattern = `%${query.q}%`;
        const search = or(ilike(activities.title, pattern), ilike(activities.description, pattern));
        if (search) conditions.push(search);
      }
      if (query.from) conditions.push(gte(activities.occurredOn, query.from));
      if (query.to) conditions.push(lte(activities.occurredOn, query.to));

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const rows = await db
        .select({ activity: activities, username: users.username })
        .from(activities)
        .leftJoin(users, eq(users.id, activities.userId))
        .where(where)
        .orderBy(desc(activities.occurredOn), desc(activities.startedAt), desc(activities.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      const [totalRow] = await db
        .select({ value: count() })
        .from(activities)
        .where(where);

      return {
        data: rows.map((r) => toActivity(r.activity, r.username)),
        total: totalRow?.value ?? 0,
      };
    },

    /** Find activities of a user overlapping [start, end). */
    async findOverlaps(
      userId: number,
      startIso: string,
      endIso: string,
      excludeActivityId?: number,
    ): Promise<Activity[]> {
      const conditions = [
        eq(activities.userId, userId),
        sql`${activities.startedAt} IS NOT NULL`,
        sql`${activities.startedAt} < ${endIso}`,
        sql`COALESCE(${activities.endedAt}, ${activities.startedAt}) > ${startIso}`,
      ];
      if (excludeActivityId !== undefined) {
        conditions.push(sql`${activities.id} <> ${excludeActivityId}`);
      }
      const rows = await db
        .select()
        .from(activities)
        .where(and(...conditions))
        .orderBy(asc(activities.startedAt));
      return rows.map((r) => toActivity(r));
    },

    /** Activities for a user within an occurred_on range (inclusive). */
    async listRange(
      userIds: number[] | null,
      from: string,
      to: string,
    ): Promise<Activity[]> {
      const conditions = [gte(activities.occurredOn, from), lte(activities.occurredOn, to)];
      if (userIds && userIds.length > 0) {
        conditions.push(
          sql`${activities.userId} IN (${sql.join(userIds.map((id) => sql`${id}`), sql`, `)})`,
        );
      } else if (userIds && userIds.length === 0) {
        return [];
      }
      const rows = await db
        .select({ activity: activities, username: users.username })
        .from(activities)
        .leftJoin(users, eq(users.id, activities.userId))
        .where(and(...conditions))
        .orderBy(asc(activities.occurredOn), asc(activities.startedAt));
      return rows.map((r) => toActivity(r.activity, r.username));
    },

    async create(input: CreateActivityInput): Promise<Activity> {
      const now = new Date().toISOString();
      const [row] = await db
        .insert(activities)
        .values({
          userId: input.userId,
          title: input.title,
          description: input.description,
          entryType: input.entryType,
          startedAt: input.startedAt,
          endedAt: input.endedAt,
          durationSeconds: input.durationSeconds,
          occurredOn: input.occurredOn,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return toActivity(row);
    },

    async update(id: number, patch: UpdateActivityPatch): Promise<Activity | null> {
      const values: Partial<ActivityRow> = { updatedAt: new Date().toISOString() };
      if (patch.title !== undefined) values.title = patch.title;
      if (patch.description !== undefined) values.description = patch.description;
      if (patch.startedAt !== undefined) values.startedAt = patch.startedAt;
      if (patch.endedAt !== undefined) values.endedAt = patch.endedAt;
      if (patch.durationSeconds !== undefined) values.durationSeconds = patch.durationSeconds;
      if (patch.occurredOn !== undefined) values.occurredOn = patch.occurredOn;
      const [row] = await db.update(activities).set(values).where(eq(activities.id, id)).returning();
      return row ? toActivity(row) : null;
    },

    async delete(id: number): Promise<void> {
      await db.delete(activities).where(eq(activities.id, id));
    },
  };
}

export type ActivityRepository = ReturnType<typeof createActivityRepository>;
