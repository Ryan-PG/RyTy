import { and, count, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { expenses, users } from "../database/schema";
import type { AppDatabase } from "../database/adapter";
import type { Expense, ExpenseListQuery } from "@ryty/shared";

type ExpenseRow = typeof expenses.$inferSelect;

function toExpense(row: ExpenseRow, username?: string | null): Expense {
  const expense: Expense = {
    id: row.id,
    userId: row.userId,
    title: row.title,
    description: row.description,
    amountMinor: row.amountMinor,
    occurredOn: row.occurredOn,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  if (username) expense.username = username;
  return expense;
}

export interface CreateExpenseInput {
  userId: number;
  title: string;
  description: string | null;
  amountMinor: number;
  occurredOn: string;
}

export interface UpdateExpensePatch {
  title?: string;
  description?: string | null;
  amountMinor?: number;
  occurredOn?: string;
}

export function createExpenseRepository(db: AppDatabase) {
  return {
    async findById(id: number): Promise<Expense | null> {
      const [row] = await db
        .select({ expense: expenses, username: users.username })
        .from(expenses)
        .leftJoin(users, eq(users.id, expenses.userId))
        .where(and(eq(expenses.id, id), isNull(expenses.deletedAt)))
        .limit(1);
      return row ? toExpense(row.expense, row.username) : null;
    },

    /** List expenses with filters and pagination (soft-deleted excluded). */
    async list(
      query: ExpenseListQuery,
      userIds: number[] | null,
    ): Promise<{ data: Expense[]; total: number }> {
      const page = query.page ?? 1;
      const pageSize = query.pageSize ?? 20;
      const conditions = [isNull(expenses.deletedAt)];
      if (userIds && userIds.length > 0) {
        conditions.push(
          sql`${expenses.userId} IN (${sql.join(userIds.map((id) => sql`${id}`), sql`, `)})`,
        );
      } else if (userIds && userIds.length === 0) {
        return { data: [], total: 0 };
      }
      if (query.q) {
        const pattern = `%${query.q.toLowerCase()}%`;
        conditions.push(sql`lower(${expenses.title}) LIKE ${pattern}`);
      }
      if (query.from) conditions.push(gte(expenses.occurredOn, query.from));
      if (query.to) conditions.push(lte(expenses.occurredOn, query.to));
      if (query.userId) conditions.push(eq(expenses.userId, query.userId));
      const where = and(...conditions);

      const rows = await db
        .select({ expense: expenses, username: users.username })
        .from(expenses)
        .leftJoin(users, eq(users.id, expenses.userId))
        .where(where)
        .orderBy(desc(expenses.occurredOn), desc(expenses.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      const [totalRow] = await db
        .select({ value: count() })
        .from(expenses)
        .where(where);

      return {
        data: rows.map((r) => toExpense(r.expense, r.username)),
        total: totalRow?.value ?? 0,
      };
    },

    async create(input: CreateExpenseInput): Promise<Expense> {
      const now = new Date().toISOString();
      const [row] = await db
        .insert(expenses)
        .values({
          userId: input.userId,
          title: input.title,
          description: input.description,
          amountMinor: input.amountMinor,
          occurredOn: input.occurredOn,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return toExpense(row);
    },

    async update(id: number, patch: UpdateExpensePatch): Promise<Expense | null> {
      const values: Partial<ExpenseRow> = { updatedAt: new Date().toISOString() };
      if (patch.title !== undefined) values.title = patch.title;
      if (patch.description !== undefined) values.description = patch.description;
      if (patch.amountMinor !== undefined) values.amountMinor = patch.amountMinor;
      if (patch.occurredOn !== undefined) values.occurredOn = patch.occurredOn;
      const [row] = await db.update(expenses).set(values).where(eq(expenses.id, id)).returning();
      return row ? toExpense(row) : null;
    },

    /** Soft delete: keep the row for audit/recovery, hide it from queries. */
    async delete(id: number): Promise<void> {
      await db
        .update(expenses)
        .set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
        .where(eq(expenses.id, id));
    },
  };
}

export type ExpenseRepository = ReturnType<typeof createExpenseRepository>;
