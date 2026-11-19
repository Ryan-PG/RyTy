import { Hono } from "hono";
import type { RuntimeEnv } from "./env";
import { createServices } from "./services/services";
import { requestContext, csrfProtection } from "./middleware/auth";
import { authRoutes } from "./routes/auth";
import { activityRoutes } from "./routes/activities";
import { timerRoutes } from "./routes/timer";
import { reportRoutes } from "./routes/reports";
import { adminRoutes } from "./routes/admin";
import { projectRoutes } from "./routes/projects";
import { tagRoutes } from "./routes/tags";
import { requireAuth, requireAdmin, blockUntilPasswordChanged } from "./middleware/auth";
import { getSetupStatus } from "./services/auth";
import { HttpError } from "./utils/http";

/**
 * Build the shared Hono application (API only — static assets are served by
 * the runtime adapters). Both the Cloudflare Worker and the Node/Docker
 * server mount the exact same app, so business rules are identical.
 */
export function createApp(env: RuntimeEnv): Hono {
  const services = createServices(env.db, env.config);
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json(
        { error: { code: err.code, message: err.message, details: err.details } },
        err.status as 400,
      );
    }
    console.error("[ryty] unhandled error:", err);
    return c.json(
      { error: { code: "internal_error", message: "Internal server error" } },
      500 as 500,
    );
  });

  app.notFound((c) => {
    if (c.req.path.startsWith("/api/")) {
      return c.json({ error: { code: "not_found", message: "Endpoint not found" } }, 404 as 404);
    }
    return c.text("Not found", 404 as 404);
  });

  app.use("/api/*", csrfProtection());
  app.use("/api/*", requestContext(services));

  // Public endpoints.
  app.get("/api/health", async (c) => {
    try {
      await services.settings.readAll();
      return c.json({ data: { status: "ok", database: "ok" } });
    } catch {
      return c.json({ data: { status: "ok", database: "unavailable" } });
    }
  });

  app.get("/api/setup/status", async (c) => {
    return c.json({ data: await getSetupStatus(services) });
  });

  app.route("/api/auth", authRoutes());

  // Protected endpoints (authentication + forced password change).
  const protectedApi = new Hono();
  protectedApi.use("*", requireAuth());
  protectedApi.use("*", blockUntilPasswordChanged());
  protectedApi.route("/activities", activityRoutes());
  protectedApi.route("/timer", timerRoutes());
  protectedApi.route("/reports", reportRoutes());
  protectedApi.route("/projects", projectRoutes());
  protectedApi.route("/tags", tagRoutes());

  // User directory for co-doer selection (and report filters). It is a
  // team application: active usernames are visible to everyone signed in.
  protectedApi.get("/users", async (c) => {
    const users = await services.users.list();
    return c.json({
      data: users.filter((u) => u.isActive).map((u) => ({ id: u.id, username: u.username })),
    });
  });

  app.route("/api", protectedApi);

  // Admin endpoints.
  const adminApi = new Hono();
  adminApi.use("*", requireAuth());
  adminApi.use("*", requireAdmin());
  adminApi.route("/", adminRoutes());
  app.route("/api/admin", adminApi);

  return app;
}
