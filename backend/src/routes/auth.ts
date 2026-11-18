import { Hono } from "hono";
import {
  loginSchema,
  changePasswordSchema,
  preferencesSchema,
} from "@ryty/shared";
import { requireAuth, blockUntilPasswordChanged } from "../middleware/auth";
import { parseJson } from "../validators/validate";
import { verifyPassword, hashPassword } from "../auth/password";
import {
  createSessionForUser,
  revokeAllSessions,
  sessionCookieHeader,
  clearSessionCookieHeader,
  parseSessionCookie,
  hashToken,
} from "../auth/session";
import { bootstrapAdmin, toAuthUser, ensureValidTimezone } from "../services/auth";
import { requestIp } from "../services/context";
import { unauthorized, forbidden } from "../utils/http";
import { LOGIN_RATE_LIMIT_MAX, LANGUAGES, THEMES } from "@ryty/shared";
import { sessions as sessionsTable } from "../database/schema";
import { eq, lt } from "drizzle-orm";

/** Auth routes. Login/logout are public; the rest require a session. */
export function authRoutes(): Hono {
  const app = new Hono();

  app.post("/login", async (c) => {
    const services = c.get("services");
    const body = await parseJson(c, loginSchema);
    const ip = requestIp(c);

    // Rate limiting (DB-backed, works on Workers and Node).
    const recentFailures = await services.loginAttempts.countRecentFailures(body.username, ip);
    if (recentFailures >= LOGIN_RATE_LIMIT_MAX) {
      return c.json(
        { error: { code: "rate_limited", message: "Too many login attempts. Try again later." } },
        429,
      );
    }

    // Initial admin bootstrap: only when no active admin exists and the
    // posted credentials exactly match the runtime bootstrap configuration.
    const admins = await services.users.countActiveAdmins();
    if (admins === 0 && services.config.initialAdminPassword) {
      const bootstrapUsername = services.config.initialAdminUsername ?? "admin";
      if (
        body.username.toLowerCase() === bootstrapUsername.toLowerCase() &&
        body.password === services.config.initialAdminPassword
      ) {
        await bootstrapAdmin(services);
      }
    }

    const row = await services.users.findRowByUsername(body.username);
    const valid = row ? await verifyPassword(body.password, row.passwordHash) : false;
    if (!row || !valid) {
      await services.loginAttempts.recordFailure(body.username, ip);
      throw unauthorized("invalid_credentials", "Invalid username or password");
    }
    if (!row.isActive) {
      throw unauthorized("invalid_credentials", "Invalid username or password");
    }

    await services.loginAttempts.clear(body.username, ip);
    // Opportunistic cleanup of expired sessions.
    await services.db
      .delete(sessionsTable)
      .where(lt(sessionsTable.expiresAt, new Date().toISOString()));

    const token = await createSessionForUser(services.db, row.id);
    const authUser = await toAuthUser(services, {
      id: row.id,
      username: row.username,
      role: row.role,
      isActive: row.isActive,
      mustChangePassword: row.mustChangePassword,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      language: row.language,
      theme: row.theme,
      timezone: row.timezone,
    });
    c.header("Set-Cookie", sessionCookieHeader(token, c.req.raw));
    return c.json({ data: authUser });
  });

  app.post("/logout", async (c) => {
    const services = c.get("services");
    const token = parseSessionCookie(c.req.raw);
    if (token) {
      const tokenHash = await hashToken(token);
      const [row] = await services.db
        .select({ id: sessionsTable.id })
        .from(sessionsTable)
        .where(eq(sessionsTable.tokenHash, tokenHash))
        .limit(1);
      if (row) await services.db.delete(sessionsTable).where(eq(sessionsTable.id, row.id));
    }
    c.header("Set-Cookie", clearSessionCookieHeader(c.req.raw));
    return c.json({ data: { ok: true } });
  });

  app.get("/me", async (c) => {
    const services = c.get("services");
    const user = c.get("user");
    if (!user) throw unauthorized();
    const fresh = await services.users.findById(user.id);
    if (!fresh) throw unauthorized();
    return c.json({ data: await toAuthUser(services, fresh) });
  });

  app.post("/change-password", requireAuth(), async (c) => {
    const services = c.get("services");
    const user = c.get("user");
    const body = await parseJson(c, changePasswordSchema);

    const row = await services.users.findRowByUsername(user.username);
    if (!row) throw unauthorized();
    const valid = await verifyPassword(body.currentPassword, row.passwordHash);
    if (!valid) {
      throw unauthorized("invalid_credentials", "Current password is incorrect");
    }

    const passwordHash = await hashPassword(body.newPassword);
    await services.users.update(user.id, {
      passwordHash,
      mustChangePassword: false,
    });

    // Revoke all other sessions; keep the current one alive.
    const token = parseSessionCookie(c.req.raw);
    let keepSessionId: string | undefined;
    if (token) {
      const [session] = await services.db
        .select({ id: sessionsTable.id })
        .from(sessionsTable)
        .where(eq(sessionsTable.tokenHash, await hashToken(token)))
        .limit(1);
      keepSessionId = session?.id;
    }
    await revokeAllSessions(services.db, user.id, keepSessionId);

    const updated = await services.users.findById(user.id);
    return c.json({ data: await toAuthUser(services, updated!) });
  });

  app.patch("/preferences", requireAuth(), blockUntilPasswordChanged(), async (c) => {
    const services = c.get("services");
    const user = c.get("user");
    const body = await parseJson(c, preferencesSchema);

    if (body.language && !LANGUAGES.includes(body.language)) {
      throw forbidden("invalid_language", "Unsupported language");
    }
    if (body.theme && !THEMES.includes(body.theme)) {
      throw forbidden("invalid_theme", "Unsupported theme");
    }
    if (body.timezone) {
      ensureValidTimezone(body.timezone);
    }

    await services.users.update(user.id, {
      language: body.language ?? undefined,
      theme: body.theme ?? undefined,
      timezone: body.timezone ?? undefined,
    });
    const updated = await services.users.findById(user.id);
    return c.json({ data: await toAuthUser(services, updated!) });
  });

  return app;
}
