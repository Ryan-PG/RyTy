import { Hono } from "hono";
import {
  reportQuerySchema,
  dailyReportQuerySchema,
  weeklyReportQuerySchema,
  monthlyReportQuerySchema,
} from "@ryty/shared";
import type { ReportSummary } from "@ryty/shared";
import { parseQuery } from "../validators/validate";
import { resolveReportScope, summarizeActivities, summarizeExpenses, activitiesToCsv } from "../services/report";
import { hydrateActivities } from "../services/activity";
import { addDays, monthStart } from "../utils/time";
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
  projectId?: number,
) {
  const activities = await services.activities.listRange(scope, from, to, projectId);
  await hydrateActivities(services, activities);
  return activities;
}

/**
 * Full summary for a range: activities plus expenses (the project filter
 * only applies to activities — expenses have no project). Both are fetched
 * under the same visibility scope.
 */
async function rangeSummary(
  services: Services,
  scope: number[] | null,
  from: string,
  to: string,
  projectId?: number,
): Promise<ReportSummary> {
  const [activities, expenses] = await Promise.all([
    reportActivities(services, scope, from, to, projectId),
    services.expenses.listRange(scope, from, to),
  ]);
  return {
    ...summarizeActivities(from, to, activities),
    ...summarizeExpenses(expenses),
  };
}

/** Report routes. Visibility rules enforced via resolveReportScope. */
export function reportRoutes(): Hono {
  const app = new Hono();

  app.get("/summary", async (c) => {
    const services = c.get("services");
    const user = c.get("user");
    const query = parseQuery(c, reportQuerySchema);
    const scope = await resolveReportScope(services, user, query.userId);
    return c.json({ data: await rangeSummary(services, scope, query.from, query.to, query.projectId) });
  });

  app.get("/daily", async (c) => {
    const services = c.get("services");
    const user = c.get("user");
    const query = parseQuery(c, dailyReportQuerySchema);
    const scope = await resolveReportScope(services, user, query.userId);
    return c.json({ data: await rangeSummary(services, scope, query.date, query.date) });
  });

  app.get("/weekly", async (c) => {
    const services = c.get("services");
    const user = c.get("user");
    const query = parseQuery(c, weeklyReportQuerySchema);
    const scope = await resolveReportScope(services, user, query.userId);
    // Rolling window: the seven days ending on the requested date.
    const to = query.date;
    const from = addDays(new Date(`${to}T00:00:00Z`), -6).toISOString().slice(0, 10);
    return c.json({ data: await rangeSummary(services, scope, from, to) });
  });

  app.get("/monthly", async (c) => {
    const services = c.get("services");
    const user = c.get("user");
    const query = parseQuery(c, monthlyReportQuerySchema);
    const scope = await resolveReportScope(services, user, query.userId);
    const from = monthStart(query.date);
    const to = lastDayOfMonth(query.date);
    return c.json({ data: await rangeSummary(services, scope, from, to) });
  });

  app.get("/export", async (c) => {
    const services = c.get("services");
    const user = c.get("user");
    const query = parseQuery(c, reportQuerySchema);
    const scope = await resolveReportScope(services, user, query.userId);
    const activities = await reportActivities(services, scope, query.from, query.to, query.projectId);
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
