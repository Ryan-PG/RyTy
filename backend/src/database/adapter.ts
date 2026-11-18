import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";

/**
 * Common database type used by all repositories.
 *
 * Both runtime adapters return an async SQLite database with an identical
 * query API; only the underlying driver (D1 / libsql) differs. The concrete
 * driver classes differ only in their run-result branding, so the adapters
 * narrow the type to this shared base at the boundary.
 */
export type AppDatabase = BaseSQLiteDatabase<"async", unknown, Record<string, never>>;
