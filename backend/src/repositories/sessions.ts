import { eq, lt } from "drizzle-orm";
import { sessions } from "../database/schema";
import type { AppDatabase } from "../database/adapter";
import { SESSION_TTL_MS } from "@ryty/shared";

export interface SessionRow {
  id: string;
  userId: number;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
}

export function createSessionRepository(db: AppDatabase) {
  return {
    async create(userId: number, tokenHash: string): Promise<SessionRow> {
      const now = new Date();
      const [row] = await db
        .insert(sessions)
        .values({
          id: crypto.randomUUID(),
          userId,
          tokenHash,
          expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
          createdAt: now.toISOString(),
        })
        .returning();
      return row;
    },

    async findByTokenHash(tokenHash: string): Promise<SessionRow | null> {
      const [row] = await db
        .select()
        .from(sessions)
        .where(eq(sessions.tokenHash, tokenHash))
        .limit(1);
      return row ?? null;
    },

    async deleteById(id: string): Promise<void> {
      await db.delete(sessions).where(eq(sessions.id, id));
    },

    /** Revoke every session of a user (used on password reset/change). */
    async deleteAllForUser(userId: number, exceptId?: string): Promise<void> {
      const rows = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId));
      const targets = rows.filter((r) => r.id !== exceptId).map((r) => r.id);
      for (const id of targets) {
        await db.delete(sessions).where(eq(sessions.id, id));
      }
    },

    async deleteExpired(): Promise<void> {
      await db.delete(sessions).where(lt(sessions.expiresAt, new Date().toISOString()));
    },
  };
}

export type SessionRepository = ReturnType<typeof createSessionRepository>;
