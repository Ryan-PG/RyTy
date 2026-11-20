import { describe, expect, it } from "vitest";
import type { Activity, Expense } from "@ryty/shared";
import { mergeRecent } from "./recent";

function makeActivity(partial: Partial<Activity>): Activity {
  return {
    id: 1,
    userId: 1,
    title: "Task",
    description: null,
    entryType: "timer",
    startedAt: null,
    endedAt: null,
    durationSeconds: 0,
    occurredOn: "2026-11-20",
    project: null,
    tags: [],
    cooperators: [],
    createdAt: "2026-11-20T00:00:00Z",
    updatedAt: "2026-11-20T00:00:00Z",
    ...partial,
  };
}

function makeExpense(partial: Partial<Expense>): Expense {
  return {
    id: 1,
    userId: 1,
    title: "Expense",
    description: null,
    amountMinor: 1000,
    occurredOn: "2026-11-20",
    createdAt: "2026-11-20T00:00:00Z",
    updatedAt: "2026-11-20T00:00:00Z",
    ...partial,
  };
}

describe("mergeRecent", () => {
  it("orders a day's timed entries before its date-only records", () => {
    const items = mergeRecent(
      [
        makeActivity({ id: 1, title: "Range", startedAt: "2026-11-20T05:30:00Z", endedAt: "2026-11-20T08:00:00Z" }),
      ],
      [
        makeExpense({ id: 2, title: "Later expense", createdAt: "2026-11-20T09:00:00Z" }),
        makeExpense({ id: 3, title: "Earlier expense", createdAt: "2026-11-20T02:00:00Z" }),
      ],
    );
    expect(items.map((i) => (i.kind === "expense" ? i.expense.title : i.activity.title))).toEqual([
      "Range",
      "Later expense",
      "Earlier expense",
    ]);
    expect(items.map((i) => i.kind)).toEqual(["activity", "expense", "expense"]);
  });

  it("places duration-only entries after timed entries of the same day", () => {
    const items = mergeRecent(
      [
        makeActivity({ id: 1, title: "Timed", startedAt: "2026-11-20T07:00:00Z", endedAt: "2026-11-20T08:00:00Z" }),
        makeActivity({ id: 2, title: "Duration only", entryType: "duration", occurredOn: "2026-11-20" }),
      ],
      [],
    );
    expect(items.map((i) => (i.kind === "activity" ? i.activity.title : ""))).toEqual([
      "Timed",
      "Duration only",
    ]);
  });

  it("files a backdated expense under its own day, never above newer days", () => {
    // Recorded on 2026-11-20 but dated 2026-11-19 — the reported bug shape.
    const items = mergeRecent(
      [
        makeActivity({ id: 1, title: "Today range", occurredOn: "2026-11-20", startedAt: "2026-11-20T07:00:00Z", endedAt: "2026-11-20T09:00:00Z" }),
        makeActivity({ id: 2, title: "Yesterday range", occurredOn: "2026-11-19", startedAt: "2026-11-19T10:00:00Z", endedAt: "2026-11-19T12:00:00Z" }),
      ],
      [makeExpense({ id: 3, title: "Backdated expense", occurredOn: "2026-11-19", createdAt: "2026-11-20T18:00:00Z" })],
    );
    expect(items.map((i) => (i.kind === "expense" ? i.expense.title : i.activity.title))).toEqual([
      "Today range",
      "Yesterday range",
      "Backdated expense",
    ]);
  });

  it("keeps older days after newer ones regardless of record time", () => {
    const items = mergeRecent(
      [makeActivity({ id: 1, title: "Old task", occurredOn: "2026-11-18", startedAt: "2026-11-18T09:00:00Z", endedAt: "2026-11-18T10:00:00Z" })],
      [makeExpense({ id: 2, title: "Old expense", occurredOn: "2026-11-19", createdAt: "2026-11-19T08:00:00Z" })],
    );
    expect(items.map((i) => (i.kind === "expense" ? i.expense.title : i.activity.title))).toEqual([
      "Old expense",
      "Old task",
    ]);
  });
});
