import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@libsql/client";
import { createLibsqlDatabase } from "../src/database/adapters/libsql";
import { resolveMigrationsDir, runMigrations } from "../src/database/migrate-node";
import { createApp } from "../src/index";
import type { Hono } from "hono";

/**
 * Integration tests for co-doers (co-operators): validation, read access
 * for co-doers, owner-only mutations, timer carry-over and report
 * attribution (time always stays with the owner).
 */

const BOOTSTRAP_PASSWORD = "bootstrap-test-password";

let app: Hono;
let db: import("@libsql/client").Client;
let adminCookie = "";
let saraCookie = "";

async function call(
  method: string,
  path: string,
  body?: unknown,
  cookie?: string,
): Promise<{ status: number; json: any }> {
  const res = await app.request(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      Origin: "http://localhost",
      "X-Forwarded-For": "203.0.113.10",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    // no body
  }
  return { status: res.status, json };
}

async function login(username: string, password: string): Promise<string> {
  const res = await app.request("/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost",
      "X-Forwarded-For": "203.0.113.10",
    },
    body: JSON.stringify({ username, password }),
  });
  if (res.status !== 200) throw new Error(`login failed for ${username}: ${res.status}`);
  return res.headers.get("set-cookie")?.split(";")[0] ?? "";
}

beforeAll(async () => {
  const client = createClient({ url: ":memory:" });
  db = client;
  const migrationsDir = await resolveMigrationsDir();
  if (!migrationsDir) throw new Error("migrations directory not found");
  await runMigrations(client, migrationsDir);
  app = createApp({
    db: createLibsqlDatabase(client),
    config: {
      initialAdminUsername: "admin",
      initialAdminPassword: BOOTSTRAP_PASSWORD,
      appTimezone: "UTC",
      defaultLanguage: "en",
    },
  });

  adminCookie = await login("admin", BOOTSTRAP_PASSWORD);
  await call(
    "POST",
    "/api/auth/change-password",
    { currentPassword: BOOTSTRAP_PASSWORD, newPassword: "AdminNewPass123" },
    adminCookie,
  );
  adminCookie = await login("admin", "AdminNewPass123");
  await call(
    "POST",
    "/api/admin/users",
    { username: "sara", password: "SaraPass12345", role: "user" },
    adminCookie,
  );
  saraCookie = await login("sara", "SaraPass12345");
});

describe("co-doers", () => {
  let activityId = 0;

  it("user directory is available to everyone signed in", async () => {
    const res = await call("GET", "/api/users", undefined, saraCookie);
    expect(res.status).toBe(200);
    const names = res.json.data.map((u: any) => u.username);
    expect(names).toContain("admin");
    expect(names).toContain("sara");
  });

  it("rejects unknown or inactive co-doers", async () => {
    const res = await call(
      "POST",
      "/api/activities",
      { entryType: "duration", title: "Solo", durationSeconds: 600, cooperatorIds: [9999] },
      adminCookie,
    );
    // Unknown ids are dropped silently: activity is created without co-doers.
    expect(res.status).toBe(201);
    expect(res.json.data.cooperators).toEqual([]);
  });

  it("owner attaches a co-doer; response includes the username", async () => {
    const res = await call(
      "POST",
      "/api/activities",
      { entryType: "duration", title: "Pair session", durationSeconds: 3600, cooperatorIds: [2] },
      adminCookie,
    );
    expect(res.status).toBe(201);
    expect(res.json.data.cooperators).toEqual([{ id: 2, username: "sara" }]);
    activityId = res.json.data.id;
  });

  it("owner is never listed as their own co-doer", async () => {
    const res = await call(
      "PATCH",
      `/api/activities/${activityId}`,
      { cooperatorIds: [1, 2] },
      adminCookie,
    );
    expect(res.status).toBe(200);
    expect(res.json.data.cooperators).toEqual([{ id: 2, username: "sara" }]);
  });

  it("co-doer sees the activity in their own list, marked with the owner", async () => {
    const res = await call("GET", "/api/activities", undefined, saraCookie);
    expect(res.status).toBe(200);
    const found = res.json.data.data.find((a: any) => a.id === activityId);
    expect(found).toBeTruthy();
    expect(found.username).toBe("admin");
    expect(found.cooperators).toEqual([{ id: 2, username: "sara" }]);
  });

  it("co-doer can edit the activity", async () => {
    const patch = await call(
      "PATCH",
      `/api/activities/${activityId}`,
      { title: "Pair session (edited by co-doer)" },
      saraCookie,
    );
    expect(patch.status).toBe(200);
    expect(patch.json.data.title).toBe("Pair session (edited by co-doer)");
    // Co-doer edits never reassign the owner or co-doer membership.
    expect(patch.json.data.userId).toBe(1);
    expect(patch.json.data.cooperators).toEqual([{ id: 2, username: "sara" }]);
  });

  it("outside users (non co-doers) cannot edit the activity", async () => {
    await call(
      "POST",
      "/api/admin/users",
      { username: "mike", password: "MikePass12345", role: "user" },
      adminCookie,
    );
    const mike = await login("mike", "MikePass12345");
    const patch = await call(
      "PATCH",
      `/api/activities/${activityId}`,
      { title: "Hacked" },
      mike,
    );
    expect(patch.status).toBe(403);
    expect(patch.json.error.code).toBe("not_owner");
  });

  it("co-doer can view the single activity endpoint", async () => {
    const res = await call("GET", `/api/activities/${activityId}`, undefined, saraCookie);
    expect(res.status).toBe(200);
    expect(res.json.data.id).toBe(activityId);
  });

  it("outside users (non co-doers) still cannot see the activity", async () => {
    // Create a third user and confirm they get 403.
    await call(
      "POST",
      "/api/admin/users",
      { username: "mike", password: "MikePass12345", role: "user" },
      adminCookie,
    );
    const mike = await login("mike", "MikePass12345");
    const res = await call("GET", `/api/activities/${activityId}`, undefined, mike);
    expect(res.status).toBe(403);
  });

  it("timer start carries co-doers; stop attaches them to the activity", async () => {
    const started = await call(
      "POST",
      "/api/timer/start",
      { title: "Pairing timer", cooperatorIds: [2] },
      adminCookie,
    );
    expect(started.status).toBe(201);
    expect(started.json.data.cooperatorIds).toEqual([2]);

    await new Promise((r) => setTimeout(r, 1100));
    const stopped = await call("POST", "/api/timer/stop", {}, adminCookie);
    expect(stopped.status).toBe(200);
    expect(stopped.json.data.cooperators).toEqual([{ id: 2, username: "sara" }]);
    // The owner attribution stays with admin.
    expect(stopped.json.data.userId).toBe(1);
  }, 15000);

  it("time stays attributed to the owner in reports", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await call("GET", `/api/reports/daily?date=${today}`, undefined, adminCookie);
    expect(res.status).toBe(200);
    const saraRow = res.json.data.byUser.find((u: any) => u.username === "sara");
    expect(saraRow?.totalSeconds ?? 0).toBe(0); // co-doer attribution only
    expect(res.json.data.byUser.find((u: any) => u.username === "admin")!.totalSeconds).toBeGreaterThan(0);
  });

  it("CSV export includes the co_doers column", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await app.request(`/api/reports/export?from=${today}&to=${today}`, {
      headers: { Cookie: adminCookie },
    });
    const text = await res.text();
    expect(text).toContain("occurred_on,username,co_doers,project,title");
    expect(text).toContain("sara");
  });

  it("removing a co-doer on update works", async () => {
    const res = await call(
      "PATCH",
      `/api/activities/${activityId}`,
      { cooperatorIds: [] },
      adminCookie,
    );
    expect(res.status).toBe(200);
    expect(res.json.data.cooperators).toEqual([]);
  });
});

describe("soft delete", () => {
  it("delete hides the activity from every endpoint but keeps the row", async () => {
    const created = await call(
      "POST",
      "/api/activities",
      { entryType: "duration", title: "Doomed entry", durationSeconds: 600 },
      adminCookie,
    );
    expect(created.status).toBe(201);
    const id = created.json.data.id as number;

    const del = await call("DELETE", `/api/activities/${id}`, undefined, adminCookie);
    expect(del.status).toBe(200);

    const gone = await call("GET", `/api/activities/${id}`, undefined, adminCookie);
    expect(gone.status).toBe(404);

    const list = await call("GET", "/api/activities?q=Doomed", undefined, adminCookie);
    expect(list.json.data.total).toBe(0);

    // The row physically remains, flagged soft-deleted (audit/recovery).
    const row = await db.execute({
      sql: "SELECT deleted_at, updated_at FROM activities WHERE id = ?",
      args: [id],
    });
    expect(row.rows.length).toBe(1);
    expect(row.rows[0].deleted_at).toBeTruthy();
  });

  it("a co-doer can delete the activity", async () => {
    const created = await call(
      "POST",
      "/api/activities",
      { entryType: "duration", title: "Shared cleanup", durationSeconds: 300, cooperatorIds: [2] },
      adminCookie,
    );
    const id = created.json.data.id as number;
    const del = await call("DELETE", `/api/activities/${id}`, undefined, saraCookie);
    expect(del.status).toBe(200);
    expect((await call("GET", `/api/activities/${id}`, undefined, adminCookie)).status).toBe(404);
  });

  it("outside users cannot delete the activity", async () => {
    const created = await call(
      "POST",
      "/api/activities",
      { entryType: "duration", title: "Protected", durationSeconds: 300 },
      adminCookie,
    );
    const id = created.json.data.id as number;
    const mike = await login("mike", "MikePass12345");
    const del = await call("DELETE", `/api/activities/${id}`, undefined, mike);
    expect(del.status).toBe(403);
  });

  it("soft-deleted activities no longer overlap new ranges", async () => {
    // Overlap detection must ignore soft-deleted rows.
    const start = "2026-05-10T09:00";
    const end = "2026-05-10T11:00";
    const first = await call(
      "POST",
      "/api/activities",
      { entryType: "range", title: "Old range", start, end },
      adminCookie,
    );
    expect(first.status).toBe(201);
    const id = first.json.data.id as number;
    await call("DELETE", `/api/activities/${id}`, undefined, adminCookie);
    const retry = await call(
      "POST",
      "/api/activities",
      { entryType: "range", title: "Replacement range", start, end },
      adminCookie,
    );
    expect(retry.status).toBe(201);
  });
});

