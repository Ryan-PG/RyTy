import { and, asc, count, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { activities, projects, users } from "../database/schema";
import type { AppDatabase } from "../database/adapter";
import type { Activity, ActivityListQuery, EntryType } from "@ryty/shared";

type ActivityRow = typeof activities.$inferSelect;

function toActivity(
  row: ActivityRow,
  username?: string | null,
  projectName?: string | null,
): Activity {
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
    project: row.projectId
      ? { id: row.projectId, name: projectName ?? "" }
      : null,
    tags: [],
    cooperators: [],
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
  projectId: number | null;
}

export interface UpdateActivityPatch {
  title?: string;
  description?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  durationSeconds?: number;
  occurredOn?: string;
  projectId?: number | null;
}

export function createActivityRepository(db: AppDatabase) {
  return {
    async findById(id: number): Promise<Activity | null> {
      const [row] = await db
        .select({ activity: activities, projectName: projects.name })
        .from(activities)
        .leftJoin(projects, eq(projects.id, activities.projectId))
        .where(and(eq(activities.id, id), isNull(activities.deletedAt)))
        .limit(1);
      return row ? toActivity(row.activity, undefined, row.projectName) : null;
    },

    async findByIdWithUser(id: number): Promise<Activity | null> {
      const [row] = await db
        .select({ activity: activities, username: users.username, projectName: projects.name })
        .from(activities)
        .leftJoin(users, eq(users.id, activities.userId))
        .leftJoin(projects, eq(projects.id, activities.projectId))
        .where(and(eq(activities.id, id), isNull(activities.deletedAt)))
        .limit(1);
      return row ? toActivity(row.activity, row.username, row.projectName) : null;
    },

    /**
     * List activities with filters and pagination.
     * `userIds` is the access-scoped list: pass null to allow every user.
     * Scoped users see activities they own OR where they are a co-doer.
     */
    async list(
      query: ActivityListQuery,
      userIds: number[] | null,
    ): Promise<{ data: Activity[]; total: number }> {
      const page = query.page ?? 1;
      const pageSize = query.pageSize ?? 20;
      const conditions = [isNull(activities.deletedAt)];
      if (userIds && userIds.length > 0) {
        conditions.push(
          sql`(${activities.userId} IN (${sql.join(userIds.map((id) => sql`${id}`), sql`, `)})
            OR EXISTS (
              SELECT 1 FROM activity_coops ac
              WHERE ac.activity_id = ${activities.id}
              AND ac.user_id IN (${sql.join(userIds.map((id) => sql`${id}`), sql`, `)})
            ))`,
        );
      } else if (userIds && userIds.length === 0) {
        return { data: [], total: 0 };
      }
      if (query.q) {
        // SQLite has no ILIKE; lower() both sides for a case-insensitive
        // search that works on D1 and SQLite alike.
        const pattern = `%${query.q.toLowerCase()}%`;
        const search = or(
          sql`lower(${activities.title}) LIKE ${pattern}`,
          sql`lower(${activities.description}) LIKE ${pattern}`,
        );
        if (search) conditions.push(search);
      }
      if (query.from) conditions.push(gte(activities.occurredOn, query.from));
      if (query.to) conditions.push(lte(activities.occurredOn, query.to));
      if (query.projectId === 0) {
        conditions.push(sql`${activities.projectId} IS NULL`);
      } else if (query.projectId) {
        conditions.push(eq(activities.projectId, query.projectId));
      }
      if (query.tag) {
        conditions.push(
          sql`EXISTS (
            SELECT 1 FROM activity_tags at
            JOIN tags t ON t.id = at.tag_id
            WHERE at.activity_id = ${activities.id} AND lower(t.name) = lower(${query.tag})
          )`,
        );
      }

      const where = and(...conditions);

      const rows = await db
        .select({ activity: activities, username: users.username, projectName: projects.name })
        .from(activities)
        .leftJoin(users, eq(users.id, activities.userId))
        .leftJoin(projects, eq(projects.id, activities.projectId))
        .where(where)
        .orderBy(desc(activities.createdAt), desc(activities.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      const [totalRow] = await db
        .select({ value: count() })
        .from(activities)
        .where(where);

      return {
        data: rows.map((r) => toActivity(r.activity, r.username, r.projectName)),
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
        isNull(activities.deletedAt),
        sql`${activities.startedAt} IS NOT NULL`,
        sql`${activities.startedAt} < ${endIso}`,
        sql`COALESCE(${activities.endedAt}, ${activities.startedAt}) > ${startIso}`,
      ];
      if (excludeActivityId !== undefined) {
        conditions.push(sql`${activities.id} <> ${excludeActivityId}`);
      }
      const rows = await db
        .select({ activity: activities, projectName: projects.name })
        .from(activities)
        .leftJoin(projects, eq(projects.id, activities.projectId))
        .where(and(...conditions))
        .orderBy(asc(activities.startedAt));
      return rows.map((r) => toActivity(r.activity, undefined, r.projectName));
    },

    /** Activities for a user within an occurred_on range (inclusive). */
    async listRange(
      userIds: number[] | null,
      from: string,
      to: string,
      projectId?: number,
    ): Promise<Activity[]> {
      const conditions = [
        isNull(activities.deletedAt),
        gte(activities.occurredOn, from),
        lte(activities.occurredOn, to),
      ];
      if (projectId === 0) {
        conditions.push(sql`${activities.projectId} IS NULL`);
      } else if (projectId) {
        conditions.push(eq(activities.projectId, projectId));
      }
      if (userIds && userIds.length > 0) {
        conditions.push(
          sql`${activities.userId} IN (${sql.join(userIds.map((id) => sql`${id}`), sql`, `)})`,
        );
      } else if (userIds && userIds.length === 0) {
        return [];
      }
      const rows = await db
        .select({ activity: activities, username: users.username, projectName: projects.name })
        .from(activities)
        .leftJoin(users, eq(users.id, activities.userId))
        .leftJoin(projects, eq(projects.id, activities.projectId))
        .where(and(...conditions))
        .orderBy(asc(activities.createdAt), asc(activities.id));
      return rows.map((r) => toActivity(r.activity, r.username, r.projectName));
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
          projectId: input.projectId,
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
      if (patch.projectId !== undefined) values.projectId = patch.projectId;
      const [row] = await db.update(activities).set(values).where(eq(activities.id, id)).returning();
      return row ? toActivity(row) : null;
    },

    /** Soft delete: keep the row for audit/recovery, hide it from queries. */
    async delete(id: number): Promise<void> {
      await db
        .update(activities)
        .set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
        .where(eq(activities.id, id));
    },
  };
}

export type ActivityRepository = ReturnType<typeof createActivityRepository>;
