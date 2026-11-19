import { Hono } from "hono";
import {
  activityListQuerySchema,
  createActivitySchema,
  updateActivitySchema,
} from "@ryty/shared";
import { parseJson, parseQuery } from "../validators/validate";
import { createActivity, getOwnedActivity, updateActivity, withTagNames } from "../services/activity";
import { HttpError } from "../utils/http";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, REPORT_VISIBILITY } from "@ryty/shared";
import type { Paginated, Activity } from "@ryty/shared";

/** Activity CRUD routes. All require an authenticated user. */
export function activityRoutes(): Hono {
  const app = new Hono();

  app.get("/", async (c) => {
    const services = c.get("services");
    const user = c.get("user");
    const query = parseQuery(c, activityListQuerySchema);

    // Visibility: private mode restricts users to their own activities.
    const appSettings = await services.settings.getAppSettings();
    const canSeeAll = user.role === "admin" || appSettings.reportsVisibility === REPORT_VISIBILITY.ALL_USERS;
    let scope: number[] | null = null;
    if (!canSeeAll) {
      scope = [user.id];
    } else if (query.userId !== undefined) {
      scope = [query.userId];
    }

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const { data, total } = await services.activities.list(query, scope);
    await withTagNames(services, data);
    const payload: Paginated<Activity> = {
      data,
      page,
      pageSize: Math.min(pageSize, MAX_PAGE_SIZE),
      total,
    };
    return c.json({ data: payload });
  });

  app.post("/", async (c) => {
    const services = c.get("services");
    const user = c.get("user");
    const input = await parseJson(c, createActivitySchema);
    const appSettings = await services.settings.getAppSettings();
    try {
      const activity = await createActivity(services, user, input, appSettings.defaultTimezone);
      await withTagNames(services, [activity]);
      return c.json({ data: activity }, 201);
    } catch (err) {
      if (err instanceof HttpError && err.code === "activity_overlap") {
        return c.json(
          {
            error: {
              code: err.code,
              message: err.message,
              details: err.details,
            },
          },
          409,
        );
      }
      throw err;
    }
  });

  app.get("/:id", async (c) => {
    const services = c.get("services");
    const user = c.get("user");
    const id = Number(c.req.param("id"));
    const activity = await getOwnedActivity(services, user, id);
    await withTagNames(services, [activity]);
    return c.json({ data: activity });
  });

  app.patch("/:id", async (c) => {
    const services = c.get("services");
    const user = c.get("user");
    const id = Number(c.req.param("id"));
    const input = await parseJson(c, updateActivitySchema);
    const appSettings = await services.settings.getAppSettings();
    try {
      const activity = await updateActivity(services, user, id, input, appSettings.defaultTimezone);
      await withTagNames(services, [activity]);
      return c.json({ data: activity });
    } catch (err) {
      if (err instanceof HttpError && err.code === "activity_overlap") {
        return c.json(
          { error: { code: err.code, message: err.message, details: err.details } },
          409,
        );
      }
      throw err;
    }
  });

  app.delete("/:id", async (c) => {
    const services = c.get("services");
    const user = c.get("user");
    const id = Number(c.req.param("id"));
    await getOwnedActivity(services, user, id);
    await services.activities.delete(id);
    return c.json({ data: { ok: true } });
  });

  return app;
}
