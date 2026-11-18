/**
 * Node/Docker runtime: serves the same Hono API plus the built SPA from one
 * origin, with SQLite (libsql) file storage and startup migrations.
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { createApp } from "../index";
import { createLibsqlDatabase } from "../database/adapters/libsql";
import { resolveMigrationsDir, runMigrations } from "../database/migrate-node";
import type { AppConfig } from "../env";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

async function resolveStaticDir(): Promise<string | null> {
  const candidates = [
    process.env.STATIC_DIR,
    path.resolve(process.cwd(), "dist", "client"),
    fileURLToPath(new URL("../../client", import.meta.url)),
    fileURLToPath(new URL("../../../dist/client", import.meta.url)),
  ].filter(Boolean) as string[];
  for (const candidate of candidates) {
    try {
      await stat(candidate);
      return candidate;
    } catch {
      // try next candidate
    }
  }
  return null;
}

async function main(): Promise<void> {
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "0.0.0.0";

  const dataFile = process.env.DATA_PATH ?? path.join(process.cwd(), "data", "ryty.db");
  await mkdir(path.dirname(dataFile), { recursive: true });

  const client = createClient({ url: `file:${dataFile}` });

  const migrationsDir = await resolveMigrationsDir(process.env.MIGRATIONS_DIR);
  if (migrationsDir) {
    const applied = await runMigrations(client, migrationsDir);
    if (applied.length > 0) {
      console.log(`[ryty] applied migrations: ${applied.join(", ")}`);
    }
  } else {
    console.warn("[ryty] no migrations directory found — expecting an initialized database");
  }

  const config: AppConfig = {
    initialAdminUsername: process.env.INITIAL_ADMIN_USERNAME,
    initialAdminPassword: process.env.INITIAL_ADMIN_PASSWORD,
    appTimezone: process.env.APP_TIMEZONE,
    defaultLanguage: process.env.DEFAULT_LANGUAGE,
  };

  const api = createApp({ db: createLibsqlDatabase(client), config });

  // Serve the built SPA from the same origin (API paths pass through).
  const staticDir = await resolveStaticDir();
  const app = new Hono();

  app.use("*", async (c, next) => {
    if (c.req.path.startsWith("/api/") || (c.req.method !== "GET" && c.req.method !== "HEAD")) {
      await next();
      return;
    }
    if (!staticDir) {
      await next();
      return;
    }
    const urlPath = decodeURIComponent(c.req.path);
    let filePath = path.normalize(path.join(staticDir, urlPath));
    if (!filePath.startsWith(staticDir)) {
      await next();
      return;
    }
    let content: Buffer;
    try {
      content = await readFile(filePath);
    } catch {
      // SPA fallback: serve index.html for client-side routes.
      filePath = path.join(staticDir, "index.html");
      try {
        content = await readFile(filePath);
      } catch {
        await next();
        return;
      }
    }
    const ext = path.extname(filePath).toLowerCase();
    return c.body(content as unknown as Uint8Array<ArrayBuffer>, 200, {
      "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=86400",
    });
  });

  app.route("/", api);

  const server = serve({ fetch: app.fetch, port, hostname: host }, (info) => {
    console.log(`[ryty] listening on http://${info.address === "0.0.0.0" ? "localhost" : info.address}:${info.port}`);
    console.log(`[ryty] database: ${dataFile}`);
    console.log(`[ryty] static assets: ${staticDir ?? "(not found — API only)"}`);
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("[ryty] fatal startup error:", err);
  process.exit(1);
});
