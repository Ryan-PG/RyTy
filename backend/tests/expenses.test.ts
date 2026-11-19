import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@libsql/client";
import { createLibsqlDatabase } from "../src/database/adapters/libsql";
import { resolveMigrationsDir, runMigrations } from "../src/database/migrate-node";
import { createApp } from "../src/index";

/**
 * Integration tests for expenses: CRUD, soft delete, owner-only
 * mutations, visibility scoping and the currency setting.
 */

const BOOTSTRAP_PASSWORD = "bootstrap-test-password";

let app: any;
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

describe("expenses", () => {
  it("rejects invalid amounts", async () => {
    const res = await call(
      "POST",
      "/api/expenses",
      { title: "Coffee", amountMinor: 0 },
      adminCookie,
    );
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe("validation_error");
  });

  it("creates an expense with minor-unit precision", async () => {
    const res = await call(
      "POST",
      "/api/expenses",
      { title: "Coffee", description: "Team break", amountMinor: 12345, occurredOn: "2026-11-01" },
      adminCookie,
    );
    expect(res.status).toBe(201);
    expect(res.json.data.amountMinor).toBe(12345);
    expect(res.json.data.occurredOn).toBe("2026-11-01");
    expect(res.json.data.username).toBeUndefined();
  });

  it("defaults the grouping date to today in the app timezone", async () => {
    const res = await call(
      "POST",
      "/api/expenses",
      { title: "Parking", amountMinor: 5000 },
      adminCookie,
    );
    expect(res.status).toBe(201);
    const today = new Date().toISOString().slice(0, 10);
    expect(res.json.data.occurredOn).toBe(today);
  });

  it("lists only the viewer's expenses in private mode (admins see all)", async () => {
    const created = await call(
      "POST",
      "/api/expenses",
      { title: "Sara's book", amountMinor: 9900 },
      saraCookie,
    );
    expect(created.status).toBe(201);

    // Admins see everything, also in private mode.
    const adminList = await call("GET", "/api/expenses", undefined, adminCookie);
    expect(adminList.json.data.data.map((e: any) => e.title)).toContain("Sara's book");

    // A third regular user sees only their own (empty) list.
    await call(
      "POST",
      "/api/admin/users",
      { username: "mike", password: "MikePass12345", role: "user" },
      adminCookie,
    );
    const mikeCookie = await login("mike", "MikePass12345");
    const mikeList = await call("GET", "/api/expenses", undefined, mikeCookie);
    expect(mikeList.json.data.total).toBe(0);

    const saraList = await call("GET", "/api/expenses", undefined, saraCookie);
    expect(saraList.json.data.data.map((e: any) => e.title)).toContain("Sara's book");
  });

  it("a user cannot read another user's expenses by id or filter", async () => {
    const created = await call(
      "POST",
      "/api/expenses",
      { title: "Admin only", amountMinor: 100 },
      adminCookie,
    );
    const id = created.json.data.id as number;
    const direct = await call("GET", `/api/expenses/${id}`, undefined, saraCookie);
    expect(direct.status).toBe(404); // not visible at all
    const filter = await call("GET", "/api/expenses?userId=1", undefined, saraCookie);
    expect(filter.status).toBe(403);
  });

  it("only the owner can update or delete an expense", async () => {
    const created = await call(
      "POST",
      "/api/expenses",
      { title: "Admin's expense", amountMinor: 7000 },
      adminCookie,
    );
    const id = created.json.data.id as number;

    const patch = await call("PATCH", `/api/expenses/${id}`, { title: "Hacked" }, saraCookie);
    expect(patch.status).toBe(403);

    const del = await call("DELETE", `/api/expenses/${id}`, undefined, saraCookie);
    expect(del.status).toBe(403);

    const patchOwner = await call(
      "PATCH",
      `/api/expenses/${id}`,
      { title: "Renamed", amountMinor: 7500 },
      adminCookie,
    );
    expect(patchOwner.status).toBe(200);
    expect(patchOwner.json.data.amountMinor).toBe(7500);
  });

  it("soft delete keeps the row but hides it from the API", async () => {
    const created = await call(
      "POST",
      "/api/expenses",
      { title: "Doomed expense", amountMinor: 1000 },
      adminCookie,
    );
    const id = created.json.data.id as number;
    const del = await call("DELETE", `/api/expenses/${id}`, undefined, adminCookie);
    expect(del.status).toBe(200);

    const gone = await call("GET", `/api/expenses/${id}`, undefined, adminCookie);
    expect(gone.status).toBe(404);
    const list = await call("GET", "/api/expenses?q=Doomed", undefined, adminCookie);
    expect(list.json.data.total).toBe(0);

    const row = await db.execute({
      sql: "SELECT deleted_at FROM expenses WHERE id = ?",
      args: [id],
    });
    expect(row.rows.length).toBe(1);
    expect(row.rows[0].deleted_at).toBeTruthy();
  });

  it("admins can filter by user", async () => {
    const res = await call("GET", "/api/expenses?userId=2", undefined, adminCookie);
    expect(res.status).toBe(200);
    for (const item of res.json.data.data) {
      expect(item.userId).toBe(2);
    }
  });

  it("the currency setting flows through admin settings and /me", async () => {
    const patched = await call("PATCH", "/api/admin/settings", { currency: "IRR" }, adminCookie);
    expect(patched.status).toBe(200);
    expect(patched.json.data.currency).toBe("IRR");

    const me = await call("GET", "/api/auth/me", undefined, saraCookie);
    expect(me.json.data.currency).toBe("IRR");

    // Reset to the documented default for the remaining expectations.
    const reset = await call("PATCH", "/api/admin/settings", { currency: "TMN" }, adminCookie);
    expect(reset.json.data.currency).toBe("TMN");
  });
});
