import { Hono } from "hono";
import {
  reportQuerySchema,
  dailyReportQuerySchema,
  weeklyReportQuerySchema,
  monthlyReportQuerySchema,
} from "@ryty/shared";
import { parseQuery } from "../validators/validate";
import { resolveReportScope, summarizeActivities, activitiesToCsv } from "../services/report";
import { hydrateActivities } from "../services/activity";
import { addDays, isoWeekStart, monthStart } from "../utils/time";
import type { Services } from "../services/services";

function lastDayOfMonth(date: string): string {
  const [y, m] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** Fetch activities for a report range with tag names attached. */
async function reportActivities(
  services: Services,
  scope: number[] | null,
  from: string,
  to: string,
) {
  const activities = await services.activities.listRange(scope, from, to);
  await hydrateActivities(services, activities);
  return activities;
}

/** Report routes. Visibility rules enforced via resolveReportScope. */
export function reportRoutes(): Hono {
  const app = new Hono();

  app.get("/summary", async (c) => {
    const services = c.get("services");
    const user = c.get("user");
    const query = parseQuery(c, reportQuerySchema);
    const scope = await resolveReportScope(services, user, query.userId);
    const activities = await reportActivities(services, scope, query.from, query.to);
    return c.json({ data: summarizeActivities(query.from, query.to, activities) });
  });

  app.get("/daily", async (c) => {
    const services = c.get("services");
    const user = c.get("user");
    const query = parseQuery(c, dailyReportQuerySchema);
    const scope = await resolveReportScope(services, user, query.userId);
    const activities = await reportActivities(services, scope, query.date, query.date);
    return c.json({ data: summarizeActivities(query.date, query.date, activities) });
  });

  app.get("/weekly", async (c) => {
    const services = c.get("services");
    const user = c.get("user");
    const query = parseQuery(c, weeklyReportQuerySchema);
    const scope = await resolveReportScope(services, user, query.userId);
    const from = isoWeekStart(query.date);
    const to = addDays(new Date(`${from}T00:00:00Z`), 6).toISOString().slice(0, 10);
    const activities = await reportActivities(services, scope, from, to);
    return c.json({ data: summarizeActivities(from, to, activities) });
  });

  app.get("/monthly", async (c) => {
    const services = c.get("services");
    const user = c.get("user");
    const query = parseQuery(c, monthlyReportQuerySchema);
    const scope = await resolveReportScope(services, user, query.userId);
    const from = monthStart(query.date);
    const to = lastDayOfMonth(query.date);
    const activities = await reportActivities(services, scope, from, to);
    return c.json({ data: summarizeActivities(from, to, activities) });
  });

  app.get("/export", async (c) => {
    const services = c.get("services");
    const user = c.get("user");
    const query = parseQuery(c, reportQuerySchema);
    const scope = await resolveReportScope(services, user, query.userId);
    const activities = await reportActivities(services, scope, query.from, query.to);
    const csv = activitiesToCsv(activities);
    const filename = `ryty-report-${query.from}-to-${query.to}.csv`;
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  });

  return app;
}
