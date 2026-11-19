import { asc, eq, inArray, sql } from "drizzle-orm";
import { activityTags, tags } from "../database/schema";
import type { AppDatabase } from "../database/adapter";
import type { Tag } from "@ryty/shared";

/** Normalize a tag name: collapse whitespace, strip, cap length. */
export function normalizeTagName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, 40);
}

export function createTagRepository(db: AppDatabase) {
  return {
    /** Autocomplete search (public tags). */
    async search(q: string | undefined, limit = 20): Promise<Tag[]> {
      const rows = q
        ? await db
            .select({ id: tags.id, name: tags.name })
            .from(tags)
            .where(sql`lower(${tags.name}) LIKE lower(${`%${q}%`})`)
            .orderBy(asc(tags.name))
            .limit(limit)
        : await db
            .select({ id: tags.id, name: tags.name })
            .from(tags)
            .orderBy(asc(tags.name))
            .limit(limit);
      return rows;
    },

    async findByName(name: string): Promise<Tag | null> {
      const [row] = await db
        .select({ id: tags.id, name: tags.name })
        .from(tags)
        .where(sql`lower(${tags.name}) = lower(${name})`)
        .limit(1);
      return row ?? null;
    },

    /** Find existing tags by (case-insensitive) name, insert missing ones. */
    async ensureMany(names: string[], createdBy: number): Promise<Tag[]> {
      const unique = new Map<string, string>();
      for (const name of names) {
        const normalized = normalizeTagName(name);
        if (normalized && !unique.has(normalized.toLowerCase())) {
          unique.set(normalized.toLowerCase(), normalized);
        }
      }
      if (unique.size === 0) return [];
      const namesList = [...unique.values()];
      const existing = await db
        .select({ id: tags.id, name: tags.name })
        .from(tags)
        .where(
          sql.join(
            namesList.map((n) => sql`lower(${tags.name}) = lower(${n})`),
            sql` OR `,
          ),
        );
      const byLower = new Map<string, Tag>(existing.map((t) => [t.name.toLowerCase(), t]));
      const missing = namesList.filter((n) => !byLower.has(n.toLowerCase()));
      for (const name of missing) {
        const [row] = await db
          .insert(tags)
          .values({ name, createdBy, createdAt: new Date().toISOString() })
          .returning({ id: tags.id, name: tags.name });
        byLower.set(name.toLowerCase(), row);
      }
      return namesList.map((n) => byLower.get(n.toLowerCase())!).filter(Boolean);
    },

    /** Tag names for a set of activities, keyed by activity id. */
    async namesForActivities(activityIds: number[]): Promise<Map<number, string[]>> {
      const map = new Map<number, string[]>();
      if (activityIds.length === 0) return map;
      const rows = await db
        .select({ activityId: activityTags.activityId, name: tags.name })
        .from(activityTags)
        .innerJoin(tags, eq(tags.id, activityTags.tagId))
        .where(inArray(activityTags.activityId, activityIds))
        .orderBy(asc(tags.name));
      for (const row of rows) {
        const list = map.get(row.activityId) ?? [];
        list.push(row.name);
        map.set(row.activityId, list);
      }
      return map;
    },

    /** Replace the tag set of one activity. */
    async setForActivity(activityId: number, tagIds: number[]): Promise<void> {
      await db.delete(activityTags).where(eq(activityTags.activityId, activityId));
      for (const tagId of tagIds) {
        await db.insert(activityTags).values({ activityId, tagId });
      }
    },
  };
}

export type TagRepository = ReturnType<typeof createTagRepository>;
