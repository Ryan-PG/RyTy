import { Hono } from "hono";
import {
  createExpenseSchema,
  expenseListQuerySchema,
  updateExpenseSchema,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "@ryty/shared";
import type { Expense, Paginated } from "@ryty/shared";
import { parseJson, parseQuery } from "../validators/validate";
import { getOwnedExpense, resolveExpenseScope } from "../services/expense";
import { todayIn } from "../utils/time";

/** Expense CRUD routes. All require an authenticated user. */
export function expenseRoutes(): Hono {
  const app = new Hono();

  app.get("/", async (c) => {
    const services = c.get("services");
    const user = c.get("user");
    const query = parseQuery(c, expenseListQuerySchema);

    const scope = await resolveExpenseScope(services, user, query.userId);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const { data, total } = await services.expenses.list(
      {
        page,
        pageSize: Math.min(pageSize, MAX_PAGE_SIZE),
        q: query.q,
        from: query.from,
        to: query.to,
      },
      scope,
    );
    const payload: Paginated<Expense> = {
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
    const input = await parseJson(c, createExpenseSchema);
    const expense = await services.expenses.create({
      userId: user.id,
      title: input.title,
      description: input.description ?? null,
      amountMinor: input.amountMinor,
      occurredOn: input.occurredOn ?? todayIn(services.config.appTimezone ?? "UTC"),
    });
    return c.json({ data: expense }, 201);
  });

  app.patch("/:id", async (c) => {
    const services = c.get("services");
    const user = c.get("user");
    const id = Number(c.req.param("id"));
    await getOwnedExpense(services, user, id);
    const input = await parseJson(c, updateExpenseSchema);
    const updated = await services.expenses.update(id, input);
    if (!updated) {
      return c.json({ error: { code: "expense_not_found", message: "Expense not found" } }, 404);
    }
    return c.json({ data: updated });
  });

  app.delete("/:id", async (c) => {
    const services = c.get("services");
    const user = c.get("user");
    const id = Number(c.req.param("id"));
    await getOwnedExpense(services, user, id);
    await services.expenses.delete(id);
    return c.json({ data: { ok: true } });
  });

  return app;
}
