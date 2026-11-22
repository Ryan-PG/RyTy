import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@libsql/client";
import { createApp } from "../src/index";
import { createLibsqlDatabase } from "../src/database/adapters/libsql";
import { resolveMigrationsDir, runMigrations } from "../src/database/migrate-node";
import type { Hono } from "hono";

/**
 * Integration tests: the same Hono app that runs in production, against an
 * in-memory SQLite database through the libsql adapter (the Node/Docker
 * target). Business rules are shared with the D1 adapter.
 */

const BOOTSTRAP_PASSWORD = "bootstrap-test-password";

let app: Hono;
let adminCookie: string;

async function call(
  method: string,
  path: string,
  body?: unknown,
  cookie?: string,
  ip = "203.0.113.10",
): Promise<{ status: number; json: any }> {
  const res = await app.request(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      Origin: "http://localhost",
      "X-Forwarded-For": ip,
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

function setCookieOf(res: { headers: Headers }): string {
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

  // Bootstrap admin login → forced password change → normal sign-in.
  const bootstrap = await login("admin", BOOTSTRAP_PASSWORD);
  expect(bootstrap).toBeTruthy();
  const change = await call(
    "POST",
    "/api/auth/change-password",
    { currentPassword: BOOTSTRAP_PASSWORD, newPassword: "AdminNewPass123" },
    bootstrap,
  );
  expect(change.status).toBe(200);
  expect(change.json.data.mustChangePassword).toBe(false);
  adminCookie = await login("admin", "AdminNewPass123");

  // Create a regular user via the admin API.
  const created = await call(
    "POST",
    "/api/admin/users",
    { username: "sara", password: "SaraPass12345", role: "user" },
    adminCookie,
  );
  expect(created.status).toBe(201);
});

/** Sign in and return the raw session cookie. */
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
  return setCookieOf(res);
}

describe("auth", () => {
  it("rejects wrong credentials without leaking details", async () => {
    const res = await call("POST", "/api/auth/login", {
      username: "admin",
      password: "wrong-password",
    });
    expect(res.status).toBe(401);
    expect(res.json.error.code).toBe("invalid_credentials");
  });

  it("blocks protected endpoints without a session", async () => {
    const res = await call("GET", "/api/activities");
    expect(res.status).toBe(401);
  });

  it("does not allow public registration", async () => {
    const res = await call("POST", "/api/admin/users", {
      username: "intruder",
      password: "Password123",
      role: "admin",
    });
    expect(res.status).toBe(401);
  });

  it("rate-limits repeated login failures", async () => {
    let status = 0;
    // A dedicated client IP so the limiter blocks only this probe.
    for (let i = 0; i < 6; i++) {
      const res = await call(
        "POST",
        "/api/auth/login",
        { username: "ratelimit-probe", password: "nope" },
        undefined,
        "198.51.100.7",
      );
      status = res.status;
    }
    expect(status).toBe(429);
  });
});

describe("activities", () => {
  let activityId: number;

  it("creates a manual range activity in the app timezone", async () => {
    const res = await call(
      "POST",
      "/api/activities",
      { entryType: "range", title: "Deep work", start: "2026-11-19T09:00", end: "2026-11-19T10:30" },
      adminCookie,
    );
    expect(res.status).toBe(201);
    expect(res.json.data.durationSeconds).toBe(5400);
    expect(res.json.data.occurredOn).toBe("2026-11-19");
    activityId = res.json.data.id;
  });

  it("rejects inverted ranges", async () => {
    const res = await call(
      "POST",
      "/api/activities",
      { entryType: "range", title: "Bad", start: "2026-11-19T12:00", end: "2026-11-19T11:00" },
      adminCookie,
    );
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe("invalid_range");
  });

  it("detects overlapping activities and can force-save", async () => {
    const payload = {
      entryType: "range",
      title: "Overlap",
      start: "2026-11-19T10:00",
      end: "2026-11-19T11:00",
    };
    const rejected = await call("POST", "/api/activities", payload, adminCookie);
    expect(rejected.status).toBe(409);
    expect(rejected.json.error.code).toBe("activity_overlap");

    const allowed = await call("POST", "/api/activities", { ...payload, allowOverlap: true }, adminCookie);
    expect(allowed.status).toBe(201);
  });

  it("creates duration-only activities without timestamps", async () => {
    const res = await call(
      "POST",
      "/api/activities",
      { entryType: "duration", title: "مطالعه کتاب", durationSeconds: 2700, occurredOn: "2026-11-18" },
      adminCookie,
    );
    expect(res.status).toBe(201);
    expect(res.json.data.startedAt).toBeNull();
    expect(res.json.data.occurredOn).toBe("2026-11-18");
  });

  it("lists activities for the owner only", async () => {
    const mine = await call("GET", "/api/activities", undefined, adminCookie);
    expect(mine.status).toBe(200);
    expect(mine.json.data.total).toBeGreaterThan(0);
    for (const item of mine.json.data.data) {
      expect(item.userId).toBe(1);
    }
  });

  it("edits and deletes own activities", async () => {
    const patched = await call(
      "PATCH",
      `/api/activities/${activityId}`,
      { title: "Deep work (edited)", description: "updated" },
      adminCookie,
    );
    expect(patched.status).toBe(200);
    expect(patched.json.data.title).toBe("Deep work (edited)");

    const deleted = await call("DELETE", `/api/activities/${activityId}`, undefined, adminCookie);
    expect(deleted.status).toBe(200);
    const gone = await call("GET", `/api/activities/${activityId}`, undefined, adminCookie);
    expect(gone.status).toBe(404);
  });
});

describe("timer lifecycle", () => {
  it("runs start → pause → resume → stop with server-side timekeeping", async () => {
    const started = await call(
      "POST",
      "/api/timer/start",
      { title: "Timed task" },
      adminCookie,
    );
    expect(started.status).toBe(201);
    expect(started.json.data.state).toBe("running");

    const double = await call("POST", "/api/timer/start", { title: "Second" }, adminCookie);
    expect(double.status).toBe(409);

    await new Promise((r) => setTimeout(r, 1100));
    const paused = await call("POST", "/api/timer/pause", {}, adminCookie);
    expect(paused.status).toBe(200);
    expect(paused.json.data.state).toBe("paused");
    expect(paused.json.data.accumulatedSeconds).toBeGreaterThan(0);

    await new Promise((r) => setTimeout(r, 1100));
    const resumed = await call("POST", "/api/timer/resume", {}, adminCookie);
    expect(resumed.status).toBe(200);
    expect(resumed.json.data.state).toBe("running");

    await new Promise((r) => setTimeout(r, 1100));
    const stopped = await call("POST", "/api/timer/stop", {}, adminCookie);
    expect(stopped.status).toBe(200);
    expect(stopped.json.data.entryType).toBe("timer");
    expect(stopped.json.data.durationSeconds).toBeGreaterThanOrEqual(2);
    expect(stopped.json.data.startedAt).not.toBeNull();

    // The timed activity lands on the real current date with real elapsed
    // seconds; delete it so date-based report assertions stay deterministic.
    await call("DELETE", `/api/activities/${stopped.json.data.id}`, undefined, adminCookie);

    const active = await call("GET", "/api/timer/active", undefined, adminCookie);
    expect(active.json.data).toBeNull();
  }, 15000);

  it("rejects timer operations without an active timer", async () => {
    const res = await call("POST", "/api/timer/stop", {}, adminCookie);
    expect(res.status).toBe(404);
  });
});

describe("reports and visibility", () => {
  beforeAll(async () => {
    // Give the admin one activity today under the current (private) mode.
    await call(
      "POST",
      "/api/activities",
      { entryType: "range", title: "Private work", start: "2026-11-20T08:00", end: "2026-11-20T09:00" },
      adminCookie,
    );
  });

  it("users cannot see others' data in private mode", async () => {
    const sara = await login("sara", "SaraPass12345");
    const res = await call("GET", "/api/reports/daily?date=2026-11-20&userId=1", undefined, sara);
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("reports_private");

    const own = await call("GET", "/api/reports/daily?date=2026-11-20", undefined, sara);
    expect(own.status).toBe(200);
    expect(own.json.data.totalSeconds).toBe(0);
  });

  it("report summaries include expenses for the range", async () => {
    const created = await call(
      "POST",
      "/api/expenses",
      { title: "Team lunch", amountMinor: 1500000, occurredOn: "2026-11-19" },
      adminCookie,
    );
    expect(created.status).toBe(201);

    const res = await call("GET", "/api/reports/summary?from=2026-11-13&to=2026-11-19", undefined, adminCookie);
    expect(res.status).toBe(200);
    expect(res.json.data.expenseCount).toBe(1);
    expect(res.json.data.expenseTotalMinor).toBe(1500000);
    expect(res.json.data.expenseByDay).toEqual([
      { date: "2026-11-19", amountMinor: 1500000, count: 1 },
    ]);

    // Private mode: another user's expense is not counted.
    const sara = await login("sara", "SaraPass12345");
    const own = await call("GET", "/api/reports/summary?from=2026-11-13&to=2026-11-19", undefined, sara);
    expect(own.status).toBe(200);
    expect(own.json.data.expenseCount).toBe(0);
    expect(own.json.data.expenseTotalMinor).toBe(0);
    expect(own.json.data.expenseByDay).toEqual([]);
  });

  it("weekly report covers the rolling seven days ending on the date", async () => {
    // Dedicated fixtures inside a clean window (no other test writes to
    // 2026-11-07..2026-11-13), so the totals are deterministic.
    const task = await call(
      "POST",
      "/api/activities",
      { entryType: "range", title: "Window task", start: "2026-11-12T09:00", end: "2026-11-12T10:00" },
      adminCookie,
    );
    expect(task.status).toBe(201);
    const expense = await call(
      "POST",
      "/api/expenses",
      { title: "Window expense", amountMinor: 250000, occurredOn: "2026-11-11" },
      adminCookie,
    );
    expect(expense.status).toBe(201);

    const res = await call("GET", "/api/reports/weekly?date=2026-11-13", undefined, adminCookie);
    expect(res.status).toBe(200);
    expect(res.json.data.from).toBe("2026-11-07");
    expect(res.json.data.to).toBe("2026-11-13");
    // Both kinds of entries inside the window are counted.
    expect(res.json.data.totalSeconds).toBe(3600);
    expect(res.json.data.expenseTotalMinor).toBe(250000);
    expect(res.json.data.expenseByDay).toEqual([
      { date: "2026-11-11", amountMinor: 250000, count: 1 },
    ]);
  });

  it("users cannot access admin endpoints", async () => {
    const sara = await login("sara", "SaraPass12345");
    const res = await call("GET", "/api/admin/users", undefined, sara);
    expect(res.status).toBe(403);
  });

  it("all_users mode opens cross-user visibility", async () => {
    await call(
      "PATCH",
      "/api/admin/settings",
      { reportsVisibility: "all_users" },
      adminCookie,
    );
    const sara = await login("sara", "SaraPass12345");
    const res = await call("GET", "/api/reports/daily?date=2026-11-20", undefined, sara);
    expect(res.status).toBe(200);
    expect(res.json.data.totalSeconds).toBe(3600);
    expect(res.json.data.byUser[0].username).toBe("admin");
  });

  it("exports CSV respecting filters", async () => {
    const res = await app.request("/api/reports/export?from=2026-11-20&to=2026-11-20", {
      headers: { Cookie: adminCookie },
    });
    expect(res.status).toBe(200);
    // Response.text() strips a leading BOM per the fetch spec — verify the
    // raw UTF-8 bytes instead (BOM = EF BB BF).
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes[0]).toBe(0xef);
    expect(bytes[1]).toBe(0xbb);
    expect(bytes[2]).toBe(0xbf);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain("Private work");
  });
});

describe("admin safeguards", () => {
  it("never removes the last active administrator", async () => {
    const demote = await call("PATCH", "/api/admin/users/1", { role: "user" }, adminCookie);
    expect(demote.status).toBe(400);
    expect(demote.json.error.code).toBe("last_admin");

    const disable = await call("PATCH", "/api/admin/users/1", { isActive: false }, adminCookie);
    expect(disable.status).toBe(400);
    expect(disable.json.error.code).toBe("last_admin");
  });

  it("rejects duplicate usernames", async () => {
    const res = await call(
      "POST",
      "/api/admin/users",
      { username: "sara", password: "Whatever123", role: "user" },
      adminCookie,
    );
    expect(res.status).toBe(409);
  });

  it("reset passwords force a change and revoke sessions", async () => {
    const sara = await login("sara", "SaraPass12345");
    const reset = await call("POST", "/api/admin/users/2/reset-password", {}, adminCookie);
    expect(reset.status).toBe(200);
    const tempPassword = reset.json.data.temporaryPassword as string;
    expect(tempPassword).toBeTruthy();

    // Old session revoked.
    const oldSession = await call("GET", "/api/auth/me", undefined, sara);
    expect(oldSession.status).toBe(401);

    // Forced change on next login, then consume it.
    const reLogin = await login("sara", tempPassword);
    const me = await call("GET", "/api/auth/me", undefined, reLogin);
    expect(me.json.data.mustChangePassword).toBe(true);
    const change = await call(
      "POST",
      "/api/auth/change-password",
      { currentPassword: tempPassword, newPassword: "SaraFinalPass123" },
      reLogin,
    );
    expect(change.status).toBe(200);
  });

  it("validates settings updates", async () => {
    const bad = await call(
      "PATCH",
      "/api/admin/settings",
      { reportsVisibility: "everyone" },
      adminCookie,
    );
    expect(bad.status).toBe(400);
  });
});

describe("user isolation", () => {
  it("users cannot modify another user's activities", async () => {
    const sara = await login("sara", "SaraFinalPass123");
    const adminList = await call("GET", "/api/activities", undefined, adminCookie);
    const someAdminActivity = adminList.json.data.data[0];
    expect(someAdminActivity).toBeTruthy();

    const res = await call(
      "DELETE",
      `/api/activities/${someAdminActivity.id}`,
      undefined,
      sara,
    );
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("not_owner");
  });
});

describe("project filters", () => {
  let projectId = 0;
  let withProjectId = 0;
  let withoutProjectId = 0;

  it("creates a project and two activities", async () => {
    const project = await call(
      "POST",
      "/api/projects",
      { name: "Filter test project" },
      adminCookie,
    );
    expect(project.status).toBe(201);
    projectId = project.json.data.id;

    const withProject = await call(
      "POST",
      "/api/activities",
      { entryType: "duration", title: "With project", durationSeconds: 600, projectId },
      adminCookie,
    );
    const withoutProject = await call(
      "POST",
      "/api/activities",
      { entryType: "duration", title: "Without project", durationSeconds: 300 },
      adminCookie,
    );
    expect(withProject.status).toBe(201);
    expect(withoutProject.status).toBe(201);
    withProjectId = withProject.json.data.id;
    withoutProjectId = withoutProject.json.data.id;
  });

  it("filters activities by project", async () => {
    const res = await call("GET", `/api/activities?projectId=${projectId}`, undefined, adminCookie);
    expect(res.status).toBe(200);
    for (const item of res.json.data.data) {
      expect(item.project?.id ?? null).toBe(projectId);
    }
  });

  it("projectId=0 selects activities without a project", async () => {
    const res = await call("GET", "/api/activities?projectId=0", undefined, adminCookie);
    expect(res.status).toBe(200);
    for (const item of res.json.data.data) {
      expect(item.project).toBeNull();
    }
    const titles = res.json.data.data.map((a: any) => a.title);
    expect(titles).toContain("Without project");
    expect(titles).not.toContain("With project");
  });

  it("report summary honors the project filter", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const only = await call(
      "GET",
      `/api/reports/summary?from=${today}&to=${today}&projectId=${projectId}`,
      undefined,
      adminCookie,
    );
    expect(only.status).toBe(200);
    expect(only.json.data.byProject).toHaveLength(1);
    expect(only.json.data.byProject[0].projectId).toBe(projectId);

    const none = await call(
      "GET",
      `/api/reports/summary?from=${today}&to=${today}&projectId=0`,
      undefined,
      adminCookie,
    );
    expect(none.status).toBe(200);
    for (const row of none.json.data.byProject) {
      expect(row.projectId).toBeNull();
    }
  });

  it("report CSV export honors the project filter", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await app.request(
      `/api/reports/export?from=${today}&to=${today}&projectId=${projectId}`,
      { headers: { Cookie: adminCookie } },
    );
    const text = await res.text();
    expect(text).toContain("With project");
    expect(text).not.toContain("Without project");
  });
});
