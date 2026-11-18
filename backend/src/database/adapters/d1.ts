import { drizzle } from "drizzle-orm/d1";
import * as schema from "../schema";
import type { AppDatabase } from "../adapter";

/** Cloudflare D1 binding → shared async SQLite database. */
export function createD1Database(d1: D1Database): AppDatabase {
  return drizzle(d1, { schema }) as unknown as AppDatabase;
}
