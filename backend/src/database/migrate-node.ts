/**
 * Migration runner for the Node/Docker target. Applies SQL migration files
 * (separated by `--> statement-breakpoint`) in filename order, tracked in a
 * `_migrations` table. Cloudflare deployments use
 * `wrangler d1 migrations apply` against the same files.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Client } from "@libsql/client";

export async function resolveMigrationsDir(explicit?: string): Promise<string | null> {
  const candidates = [
    explicit,
    path.resolve(process.cwd(), "migrations"),
    fileURLToPath(new URL("../../../migrations", import.meta.url)),
    fileURLToPath(new URL("../../../../migrations", import.meta.url)),
  ].filter(Boolean) as string[];
  for (const candidate of candidates) {
    try {
      const entries = await readdir(candidate);
      if (entries.some((e) => e.endsWith(".sql"))) return candidate;
    } catch {
      // try next candidate
    }
  }
  return null;
}

export async function runMigrations(client: Client, migrationsDir: string): Promise<string[]> {
  await client.execute(
    "CREATE TABLE IF NOT EXISTS _migrations (filename TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
  const applied = new Set<string>();
  const rows = await client.execute("SELECT filename FROM _migrations");
  for (const row of rows.rows) applied.add(String(row.filename));

  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const newlyApplied: string[] = [];

  for (const file of files) {
    if (applied.has(file)) continue;
    const content = await readFile(path.join(migrationsDir, file), "utf8");
    const statements = content
      .split("--> statement-breakpoint")
      .map((s) =>
        s
          .split("\n")
          // libsql's local client fails on statements with leading `--`
          // comments; strip full-line comments before executing.
          .filter((line) => !/^\s*--/.test(line))
          .join("\n")
          .trim(),
      )
      .filter((s) => s.length > 0);
    // batch() wraps the statements in a transaction. Statement comment
    // lines are stripped above because the local libsql client rejects
    // statements with leading comments.
    await client.batch(
      statements.map((sql) => ({ sql, args: [] })),
      "write",
    );
    await client.execute({
      sql: "INSERT INTO _migrations (filename, applied_at) VALUES (?, ?)",
      args: [file, new Date().toISOString()],
    });
    newlyApplied.push(file);
  }
  return newlyApplied;
}
