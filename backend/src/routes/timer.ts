import { Hono } from "hono";
import { timerStartSchema } from "@ryty/shared";
import { parseJson } from "../validators/validate";
import {
  startTimer,
  pauseTimer,
  resumeTimer,
  stopTimer,
  timerElapsedSeconds,
} from "../services/timer";

/** Timer lifecycle routes. All require an authenticated user. */
export function timerRoutes(): Hono {
  const app = new Hono();

  app.post("/start", async (c) => {
    const services = c.get("services");
    const user = c.get("user");
    const body = await parseJson(c, timerStartSchema);
    const timer = await startTimer(services, user, body.title, body.description ?? null);
    return c.json({ data: { ...timer, elapsedSeconds: timerElapsedSeconds(timer) } }, 201);
  });

  app.post("/pause", async (c) => {
    const services = c.get("services");
    const user = c.get("user");
    const timer = await pauseTimer(services, user);
    return c.json({ data: { ...timer, elapsedSeconds: timerElapsedSeconds(timer) } });
  });

  app.post("/resume", async (c) => {
    const services = c.get("services");
    const user = c.get("user");
    const timer = await resumeTimer(services, user);
    return c.json({ data: { ...timer, elapsedSeconds: timerElapsedSeconds(timer) } });
  });

  app.post("/stop", async (c) => {
    const services = c.get("services");
    const user = c.get("user");
    const appSettings = await services.settings.getAppSettings();
    // Body is optional: allows adjusting title/description at stop time.
    const raw = await c.req.json().catch(() => ({}));
    const overrides = {
      title: typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : undefined,
      description:
        typeof raw.description === "string" ? raw.description.trim() || null : undefined,
    };
    const activity = await stopTimer(services, user, overrides, appSettings.defaultTimezone);
    return c.json({ data: activity });
  });

  app.get("/active", async (c) => {
    const services = c.get("services");
    const user = c.get("user");
    const timer = await services.timers.findByUserId(user.id);
    if (!timer) return c.json({ data: null });
    return c.json({ data: { ...timer, elapsedSeconds: timerElapsedSeconds(timer) } });
  });

  return app;
}
