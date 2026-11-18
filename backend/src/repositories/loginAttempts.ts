import { and, count, eq, gte } from "drizzle-orm";
import { loginAttempts } from "../database/schema";
import type { AppDatabase } from "../database/adapter";
import { LOGIN_RATE_LIMIT_MAX, LOGIN_RATE_LIMIT_WINDOW_MS } from "@ryty/shared";

export function createLoginAttemptsRepository(db: AppDatabase) {
  return {
    async recordFailure(username: string, ip: string): Promise<void> {
      await db.insert(loginAttempts).values({
        username: username.toLowerCase(),
        ip,
        attemptedAt: new Date().toISOString(),
      });
    },

    /** Count recent failures for the username and the IP combined. */
    async countRecentFailures(username: string, ip: string): Promise<number> {
      const since = new Date(Date.now() - LOGIN_RATE_LIMIT_WINDOW_MS).toISOString();
      const [byUser] = await db
        .select({ value: count() })
        .from(loginAttempts)
        .where(
          and(
            eq(loginAttempts.username, username.toLowerCase()),
            gte(loginAttempts.attemptedAt, since),
          ),
        );
      const [byIp] = await db
        .select({ value: count() })
        .from(loginAttempts)
        .where(and(eq(loginAttempts.ip, ip), gte(loginAttempts.attemptedAt, since)));
      return Math.max(byUser?.value ?? 0, byIp?.value ?? 0);
    },

    /** Clear recorded failures after a successful login. */
    async clear(username: string, ip: string): Promise<void> {
      const rows = await db
        .select({ id: loginAttempts.id })
        .from(loginAttempts)
        .where(eq(loginAttempts.username, username.toLowerCase()));
      for (const row of rows) {
        await db.delete(loginAttempts).where(eq(loginAttempts.id, row.id));
      }
      const ipRows = await db
        .select({ id: loginAttempts.id })
        .from(loginAttempts)
        .where(eq(loginAttempts.ip, ip));
      for (const row of ipRows) {
        await db.delete(loginAttempts).where(eq(loginAttempts.id, row.id));
      }
    },
  };
}

export type LoginAttemptsRepository = ReturnType<typeof createLoginAttemptsRepository>;

export { LOGIN_RATE_LIMIT_MAX };
