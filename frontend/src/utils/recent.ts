import type { Activity, Expense } from "@ryty/shared";

/** One row of the Home "Recent" timeline. */
export type RecentItem =
  | { kind: "activity"; activity: Activity }
  | { kind: "expense"; expense: Expense };

/**
 * Interleave activities and expenses, newest first. Activities sort by
 * their latest instant (duration-only entries fall back to their local
 * day, which places them last within that day); expenses sort by when
 * they were recorded.
 */
export function mergeRecent(activities: Activity[], expenses: Expense[]): RecentItem[] {
  const keyed: { at: string; item: RecentItem }[] = [
    ...activities.map((activity) => ({
      at: activity.endedAt ?? activity.startedAt ?? activity.occurredOn,
      item: { kind: "activity" as const, activity },
    })),
    ...expenses.map((expense) => ({
      at: expense.createdAt,
      item: { kind: "expense" as const, expense },
    })),
  ];
  keyed.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return keyed.map((entry) => entry.item);
}
