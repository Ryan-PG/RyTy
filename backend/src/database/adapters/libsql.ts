import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../schema";
import type { AppDatabase } from "../adapter";

/**
 * Local SQLite file (or in-memory) → shared async SQLite database.
 * Used by the Docker/Node deployment target and the test suite.
 */
export function createLibsqlDatabase(client: Client): AppDatabase {
  return drizzle(client, { schema }) as unknown as AppDatabase;
}

export { createClient };
export type { Client };
