import type { Expense } from "@ryty/shared";
import type { AuthenticatedUser } from "../auth/session";
import { REPORT_VISIBILITY } from "@ryty/shared";
import type { Services } from "./services";
import { forbidden, notFound } from "../utils/http";
import { todayIn } from "../utils/time";

/**
 * Expense visibility matches activities: admins always see everything;
 * regular users see only their own data in "private" mode, everyone's
 * data in "all_users" mode. Returns null to mean "all users".
 */
export async function resolveExpenseScope(
  services: Services,
  user: AuthenticatedUser,
  requestedUserId?: number,
): Promise<number[] | null> {
  const appSettings = await services.settings.getAppSettings();
  const canSeeAll = user.role === "admin" || appSettings.reportsVisibility === REPORT_VISIBILITY.ALL_USERS;
  if (!canSeeAll) {
    if (requestedUserId !== undefined && requestedUserId !== user.id) {
      throw forbidden("expenses_private", "Expense visibility is restricted to your own data");
    }
    return [user.id];
  }
  if (requestedUserId !== undefined) return [requestedUserId];
  return null;
}

/** Guard: only the owner may mutate an expense (no co-doers here). */
export async function getOwnedExpense(
  services: Services,
  user: AuthenticatedUser,
  id: number,
): Promise<Expense> {
  const expense = await services.expenses.findById(id);
  if (!expense) throw notFound("expense_not_found", "Expense not found");
  if (expense.userId !== user.id) {
    throw forbidden("not_owner", "You can only access your own expenses");
  }
  return expense;
}

/** Default grouping date for new expenses (application timezone). */
export function defaultExpenseDate(services: Services): string {
  return todayIn(services.config.appTimezone ?? "UTC");
}
