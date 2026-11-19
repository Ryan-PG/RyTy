import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@libsql/client";
import { createLibsqlDatabase } from "../src/database/adapters/libsql";
import { resolveMigrationsDir, runMigrations } from "../src/database/migrate-node";
import { createApp } from "../src/index";

/**
 * Application settings: admin-only updates, defaults and exposure to
 * regular users through /api/auth/me.
 */

const BOOTSTRAP_PASSWORD = "bootstrap-test-password";

let app: any;
let adminCookie = "";

async function call(method: string, path: string, body?: unknown, cookie?: string) {
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
  if (res.status !== 200) throw new Error(`login failed: ${res.status}`);
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
});

describe("app settings", () => {
  it("exposes documented defaults", async () => {
    const res = await call("GET", "/api/admin/settings", undefined, adminCookie);
    expect(res.status).toBe(200);
    expect(res.json.data).toMatchObject({
      appName: "RyTy",
      defaultLanguage: "en",
      reportsVisibility: "private",
      currency: "TMN",
      dateFormat: "gregorian",
    });
  });

  it("rejects an unknown date format", async () => {
    const res = await call(
      "PATCH",
      "/api/admin/settings",
      { dateFormat: "hijri" },
      adminCookie,
    );
    expect(res.status).toBe(400);
  });

  it("switches the display calendar and exposes it to users", async () => {
    const patched = await call(
      "PATCH",
      "/api/admin/settings",
      { dateFormat: "jalali" },
      adminCookie,
    );
    expect(patched.status).toBe(200);
    expect(patched.json.data.dateFormat).toBe("jalali");

    const me = await call("GET", "/api/auth/me", undefined, adminCookie);
    expect(me.json.data.dateFormat).toBe("jalali");

    // Reset for other expectations.
    await call("PATCH", "/api/admin/settings", { dateFormat: "gregorian" }, adminCookie);
  });

  it("regular users cannot change settings", async () => {
    await call(
      "POST",
      "/api/admin/users",
      { username: "sara", password: "SaraPass12345", role: "user" },
      adminCookie,
    );
    const sara = await login("sara", "SaraPass12345");
    const res = await call(
      "PATCH",
      "/api/admin/settings",
      { dateFormat: "jalali" },
      sara,
    );
    expect(res.status).toBe(403);
  });
});
