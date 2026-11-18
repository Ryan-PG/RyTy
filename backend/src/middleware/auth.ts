import type { MiddlewareHandler } from "hono";
import { resolveSessionUser } from "../auth/session";
import { forbidden, unauthorized } from "../utils/http";
import type { AuthenticatedUser } from "../auth/session";
import type { Services } from "../services/services";

/**
 * Resolve the session user for every request (public routes included) and
 * expose the services bundle on the context.
 */
export function requestContext(services: Services): MiddlewareHandler {
  return async (c, next) => {
    c.set("services", services);
    const user = await resolveSessionUser(services.db, c.req.raw);
    if (user) c.set("user", user);
    await next();
  };
}

/** Require an authenticated, active user. */
export function requireAuth(): MiddlewareHandler {
  return async (c, next) => {
    const user = c.get("user");
    if (!user) throw unauthorized();
    await next();
  };
}

/** Require an administrator. Must run after requireAuth(). */
export function requireAdmin(): MiddlewareHandler {
  return async (c, next) => {
    const user = c.get("user");
    if (!user) throw unauthorized();
    if (user.role !== "admin") throw forbidden("admin_required", "Administrator access required");
    await next();
  };
}

/**
 * Block all application endpoints until a forced password change is done.
 * Applied to every route except the auth endpoints needed to change the
 * password or log out.
 */
export function blockUntilPasswordChanged(): MiddlewareHandler {
  return async (c, next) => {
    const user: AuthenticatedUser | undefined = c.get("user");
    if (user?.mustChangePassword) {
      throw forbidden("password_change_required", "You must change your password before continuing");
    }
    await next();
  };
}

/**
 * CSRF protection: mutating requests must be JSON, and when the browser
 * sends an Origin header it must match the request origin. Combined with
 * SameSite=Lax session cookies this blocks cross-site form/fetch attacks.
 */
export function csrfProtection(): MiddlewareHandler {
  return async (c, next) => {
    const method = c.req.method.toUpperCase();
    if (method !== "POST" && method !== "PATCH" && method !== "PUT" && method !== "DELETE") {
      await next();
      return;
    }
    const contentType = c.req.header("Content-Type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      throw forbidden("csrf_rejected", "Requests must use application/json");
    }
    const origin = c.req.header("Origin");
    if (origin) {
      const { requestOrigin } = await import("../services/context");
      if (origin !== requestOrigin(c)) {
        throw forbidden("csrf_rejected", "Cross-origin requests are not allowed");
      }
    }
    await next();
  };
}
