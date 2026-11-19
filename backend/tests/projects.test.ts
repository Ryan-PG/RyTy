import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@libsql/client";
import { createLibsqlDatabase } from "../src/database/adapters/libsql";
import { resolveMigrationsDir, runMigrations } from "../src/database/migrate-node";
import { createApp } from "../src/index";
import type { Hono } from "hono";

/**
 * Integration tests for projects & tags: visibility rules, suggestion →
 * approval flow, default project, tag auto-creation and activity linking.
 */

const BOOTSTRAP_PASSWORD = "bootstrap-test-password";

let app: Hono;

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

let adminCookie = "";
let saraCookie = "";

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

describe("projects", () => {
  let publicId = 0;
  let privateId = 0;
  let suggestedId = 0;

  it("admin creates a public and a private project", async () => {
    const pub = await call(
      "POST",
      "/api/projects",
      { name: "Website Redesign", visibility: "public" },
      adminCookie,
    );
    expect(pub.status).toBe(201);
    expect(pub.json.data.visibility).toBe("public");
    expect(pub.json.data.status).toBe("active");
    publicId = pub.json.data.id;

    const priv = await call(
      "POST",
      "/api/projects",
      { name: "Admin Personal", visibility: "private" },
      adminCookie,
    );
    expect(priv.status).toBe(201);
    privateId = priv.json.data.id;
  });

  it("rejects duplicate project names (case-insensitive)", async () => {
    const res = await call(
      "POST",
      "/api/projects",
      { name: "website redesign", visibility: "public" },
      adminCookie,
    );
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("project_name_taken");
  });

  it("user cannot create a public project directly", async () => {
    const res = await call(
      "POST",
      "/api/projects",
      { name: "User Force Public", visibility: "public" },
      saraCookie,
    );
    expect(res.status).toBe(201);
    expect(res.json.data.visibility).toBe("private");
    expect(res.json.data.status).toBe("active");
  });

  it("user creates a private project and a suggestion", async () => {
    const own = await call("POST", "/api/projects", { name: "Sara Private" }, saraCookie);
    expect(own.status).toBe(201);
    expect(own.json.data.visibility).toBe("private");

    const suggested = await call(
      "POST",
      "/api/projects",
      { name: "Marketing Site", suggest: true },
      saraCookie,
    );
    expect(suggested.status).toBe(201);
    expect(suggested.json.data.status).toBe("suggested");
    suggestedId = suggested.json.data.id;
  });

  it("users see public + own projects only", async () => {
    const res = await call("GET", "/api/projects", undefined, saraCookie);
    expect(res.status).toBe(200);
    const names = res.json.data.map((p: any) => p.name);
    expect(names).toContain("Website Redesign"); // public
    expect(names).toContain("Sara Private"); // own
    expect(names).toContain("Marketing Site"); // own suggestion
    expect(names).not.toContain("Admin Personal"); // admin's private
  });

  it("admins see every project", async () => {
    const res = await call("GET", "/api/projects", undefined, adminCookie);
    const names = res.json.data.map((p: any) => p.name);
    expect(names).toContain("Admin Personal");
    expect(names).toContain("Marketing Site");
  });

  it("private projects of others cannot be used in activities", async () => {
    const res = await call(
      "POST",
      "/api/activities",
      {
        entryType: "duration",
        title: "With project",
        durationSeconds: 600,
        projectId: privateId,
      },
      saraCookie,
    );
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("project_not_accessible");
  });

  it("activities can carry an accessible project and tags", async () => {
    const res = await call(
      "POST",
      "/api/activities",
      {
        entryType: "duration",
        title: "Design work",
        durationSeconds: 3600,
        projectId: publicId,
        tags: ["design", "review"],
      },
      saraCookie,
    );
    expect(res.status).toBe(201);
    expect(res.json.data.project).toEqual({ id: publicId, name: "Website Redesign" });
    expect(res.json.data.tags.length).toBe(2);
  });

  it("tag creation is idempotent and case-insensitive", async () => {
    const first = await call("POST", "/api/tags", { name: "Design" }, saraCookie);
    const second = await call("POST", "/api/tags", { name: "design" }, adminCookie);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.json.data.id).toBe(first.json.data.id);
  });

  it("tag autocomplete search is public", async () => {
    const res = await call("GET", "/api/tags?q=des", undefined, saraCookie);
    expect(res.status).toBe(200);
    expect(res.json.data.some((t: any) => t.name.toLowerCase() === "design")).toBe(true);
  });

  it("timer start carries project + tags; stop converts them into the activity", async () => {
    const started = await call(
      "POST",
      "/api/timer/start",
      { title: "Timer with project", projectId: publicId, tags: ["focus"] },
      saraCookie,
    );
    expect(started.status).toBe(201);
    expect(started.json.data.project?.id).toBe(publicId);
    expect(started.json.data.tags).toContain("focus");

    await new Promise((r) => setTimeout(r, 1100));
    const stopped = await call("POST", "/api/timer/stop", {}, saraCookie);
    expect(stopped.status).toBe(200);
    expect(stopped.json.data.project?.id).toBe(publicId);
    expect(stopped.json.data.tags).toContain("focus");
  }, 15000);

  it("activities can be filtered by project and tag", async () => {
    const byTag = await call(
      "GET",
      "/api/activities?tag=design",
      undefined,
      saraCookie,
    );
    expect(byTag.status).toBe(200);
    expect(byTag.json.data.total).toBe(1);

    const byProject = await call(
      "GET",
      `/api/activities?projectId=${publicId}`,
      undefined,
      saraCookie,
    );
    expect(byProject.json.data.total).toBe(2); // duration + stopped timer
  });

  it("suggestion → approve makes the project public", async () => {
    const before = await call("GET", "/api/projects", undefined, adminCookie);
    const suggested = before.json.data.find((p: any) => p.status === "suggested");
    expect(suggested).toBeTruthy();

    const rejected = await call(
      "POST",
      `/api/projects/${suggested.id}/approve`,
      undefined,
      saraCookie,
    );
    expect(rejected.status).toBe(403); // non-admin cannot approve

    const approved = await call(
      "POST",
      `/api/projects/${suggestedId}/approve`,
      undefined,
      adminCookie,
    );
    expect(approved.status).toBe(200);
    expect(approved.json.data.status).toBe("active");
    expect(approved.json.data.visibility).toBe("public");
  });

  it("suggestion → reject keeps it as the creator's private project", async () => {
    const suggested = await call(
      "POST",
      "/api/projects",
      { name: "Internal Docs", suggest: true },
      saraCookie,
    );
    const rejected = await call(
      "POST",
      `/api/projects/${suggested.json.data.id}/reject`,
      undefined,
      adminCookie,
    );
    expect(rejected.status).toBe(200);
    expect(rejected.json.data.status).toBe("active");
    expect(rejected.json.data.visibility).toBe("private");
  });

  it("default project preference validates access", async () => {
    const bad = await call(
      "PATCH",
      "/api/auth/preferences",
      { defaultProjectId: privateId }, // admin's private project
      saraCookie,
    );
    expect(bad.status).toBe(403);

    const good = await call(
      "PATCH",
      "/api/auth/preferences",
      { defaultProjectId: publicId },
      saraCookie,
    );
    expect(good.status).toBe(200);
    expect(good.json.data.defaultProjectId).toBe(publicId);

    const cleared = await call(
      "PATCH",
      "/api/auth/preferences",
      { defaultProjectId: null },
      saraCookie,
    );
    expect(cleared.json.data.defaultProjectId).toBeNull();
  });

  it("deleting a project clears it from activities and defaults", async () => {
    const proj = await call(
      "POST",
      "/api/projects",
      { name: "Doomed Project", visibility: "public" },
      adminCookie,
    );
    const doomedId = proj.json.data.id;
    await call(
      "PATCH",
      "/api/auth/preferences",
      { defaultProjectId: doomedId },
      saraCookie,
    );
    const activity = await call(
      "POST",
      "/api/activities",
      { entryType: "duration", title: "On doomed", durationSeconds: 300, projectId: doomedId },
      saraCookie,
    );

    const del = await call("DELETE", `/api/projects/${doomedId}`, undefined, adminCookie);
    expect(del.status).toBe(200);

    const after = await call(
      "GET",
      `/api/activities/${activity.json.data.id}`,
      undefined,
      saraCookie,
    );
    expect(after.json.data.project).toBeNull();

    const me = await call("GET", "/api/auth/me", undefined, saraCookie);
    expect(me.json.data.defaultProjectId).toBeNull();
  });
});
