import { Hono } from "hono";
import {
  createUserSchema,
  updateUserSchema,
  resetPasswordSchema,
  updateSettingsSchema,
  type UpdateSettingsInput,
} from "@ryty/shared";
import { parseJson } from "../validators/validate";
import { hashPassword, generateRandomPassword } from "../auth/password";
import { revokeAllSessions } from "../auth/session";
import { badRequest, conflict, notFound } from "../utils/http";
import { ROLES } from "@ryty/shared";

/** Admin-only routes: user management and application settings. */
export function adminRoutes(): Hono {
  const app = new Hono();

  /* ------------------------- User management ------------------------- */

  app.get("/users", async (c) => {
    const services = c.get("services");
    const users = await services.users.list();
    return c.json({ data: users });
  });

  app.post("/users", async (c) => {
    const services = c.get("services");
    const body = await parseJson(c, createUserSchema);
    if (await services.users.existsByUsername(body.username)) {
      throw conflict("username_taken", "This username is already in use");
    }
    const user = await services.users.create({
      username: body.username,
      passwordHash: await hashPassword(body.password),
      role: body.role,
      mustChangePassword: false,
    });
    return c.json({ data: user }, 201);
  });

  app.patch("/users/:id", async (c) => {
    const services = c.get("services");
    const id = Number(c.req.param("id"));
    const target = await services.users.findById(id);
    if (!target) throw notFound("user_not_found", "User not found");
    const body = await parseJson(c, updateUserSchema);

    if (body.username !== undefined && (await services.users.existsByUsername(body.username, id))) {
      throw conflict("username_taken", "This username is already in use");
    }

    // Last-active-admin protection: never demote or disable the only admin.
    const willLoseAdmin =
      (body.role !== undefined && target.role === ROLES.ADMIN && body.role !== ROLES.ADMIN) ||
      (body.isActive === false && target.role === ROLES.ADMIN && target.isActive);
    if (willLoseAdmin) {
      const remaining = await services.users.countActiveAdmins(id);
      if (remaining === 0) {
        throw badRequest("last_admin", "The system must keep at least one active administrator");
      }
    }

    const updated = await services.users.update(id, {
      username: body.username,
      role: body.role,
      isActive: body.isActive,
    });

    // Revoking access must end existing sessions immediately.
    if (body.isActive === false) {
      await revokeAllSessions(services.db, id);
    }

    return c.json({ data: updated });
  });

  app.post("/users/:id/reset-password", async (c) => {
    const services = c.get("services");
    const id = Number(c.req.param("id"));
    const target = await services.users.findById(id);
    if (!target) throw notFound("user_not_found", "User not found");
    const body = await parseJson(c, resetPasswordSchema);

    const generated = body.password === undefined ? generateRandomPassword() : undefined;
    const password = generated ?? body.password!;
    await services.users.update(id, {
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
    });
    await revokeAllSessions(services.db, id);

    return c.json({
      data: {
        temporaryPassword: generated,
        mustChangePassword: true,
      },
    });
  });

  /* ------------------------ Application settings --------------------- */

  app.get("/settings", async (c) => {
    const services = c.get("services");
    return c.json({ data: await services.settings.getAppSettings() });
  });

  app.patch("/settings", async (c) => {
    const services = c.get("services");
    const body = await parseJson(c, updateSettingsSchema);
    const keyMap: Record<keyof UpdateSettingsInput, string> = {
      appName: "app_name",
      defaultLanguage: "default_language",
      defaultTimezone: "default_timezone",
      reportsVisibility: "reports_visibility",
      currency: "currency",
    };
    for (const [field, key] of Object.entries(keyMap) as [keyof UpdateSettingsInput, string][]) {
      const value = body[field];
      if (value !== undefined) {
        await services.settings.write(key, String(value));
      }
    }
    return c.json({ data: await services.settings.getAppSettings() });
  });

  return app;
}
