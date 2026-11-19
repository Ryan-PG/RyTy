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

  it("co-doer cannot edit or delete the activity", async () => {
    const patch = await call(
      "PATCH",
      `/api/activities/${activityId}`,
      { title: "Hacked" },
      saraCookie,
    );
    expect(patch.status).toBe(403);
    expect(patch.json.error.code).toBe("not_owner");

    const del = await call("DELETE", `/api/activities/${activityId}`, undefined, saraCookie);
    expect(del.status).toBe(403);
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
