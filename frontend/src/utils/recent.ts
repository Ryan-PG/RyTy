import type { Activity, Expense } from "@ryty/shared";

/** One row of the Home "Recent" timeline. */
export type RecentItem =
  | { kind: "activity"; activity: Activity }
  | { kind: "expense"; expense: Expense };

/**
 * Order the timeline by **creation date**, newest record first — a task or
 * expense the user just saved (however far back it is dated) always leads
 * the list. `createdAt` values are ISO-8601 strings, so string comparison
 * is chronological.
 */
export function mergeRecent(activities: Activity[], expenses: Expense[]): RecentItem[] {
  const keyed: { createdAt: string; item: RecentItem }[] = [
    ...activities.map((activity) => ({
      createdAt: activity.createdAt,
      item: { kind: "activity" as const, activity },
    })),
    ...expenses.map((expense) => ({
      createdAt: expense.createdAt,
      item: { kind: "expense" as const, expense },
    })),
  ];
  keyed.sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
  );
  return keyed.map((entry) => entry.item);
}
