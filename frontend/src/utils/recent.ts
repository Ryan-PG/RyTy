import type { Activity, Expense } from "@ryty/shared";

/** One row of the Home "Recent" timeline. */
export type RecentItem =
  | { kind: "activity"; activity: Activity }
  | { kind: "expense"; expense: Expense };

/**
 * Order the timeline by each record's **own date** (`occurredOn`), newest
 * day first — a backdated expense (recorded today for yesterday) therefore
 * never jumps above newer days. Within a day: timed entries (timer/range)
 * sort by their instant, then date-only records (duration-only activities,
 * expenses — no time of day) by when they were recorded.
 */
export function mergeRecent(activities: Activity[], expenses: Expense[]): RecentItem[] {
  const keyed: { day: string; at: string; createdAt: string; item: RecentItem }[] = [
    ...activities.map((activity) => ({
      day: activity.occurredOn,
      at: activity.endedAt ?? activity.startedAt ?? "",
      createdAt: activity.createdAt,
      item: { kind: "activity" as const, activity },
    })),
    ...expenses.map((expense) => ({
      day: expense.occurredOn,
      at: "",
      createdAt: expense.createdAt,
      item: { kind: "expense" as const, expense },
    })),
  ];
  keyed.sort((a, b) => {
    if (a.day !== b.day) return a.day < b.day ? 1 : -1;
    // "" (date-only records) sorts after same-day timed instants.
    if (a.at !== b.at) return a.at < b.at ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
  });
  return keyed.map((entry) => entry.item);
}
