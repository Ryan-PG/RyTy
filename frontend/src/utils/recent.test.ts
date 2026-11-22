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
  it("orders purely by creation date, newest first", () => {
    const items = mergeRecent(
      [makeActivity({ id: 1, title: "Old task", createdAt: "2026-11-20T08:00:00Z" })],
      [
        makeExpense({ id: 2, title: "Newest expense", createdAt: "2026-11-20T18:00:00Z" }),
        makeExpense({ id: 3, title: "Oldest expense", createdAt: "2026-11-20T02:00:00Z" }),
      ],
    );
    expect(items.map((i) => (i.kind === "expense" ? i.expense.title : i.activity.title))).toEqual([
      "Newest expense",
      "Old task",
      "Oldest expense",
    ]);
  });

  it("places a duration added after a time range above it", () => {
    // The reported bug shape: a duration entry saved later was sorted under
    // same-day timed entries; creation date must win instead.
    const items = mergeRecent(
      [
        makeActivity({
          id: 1,
          title: "Range task",
          entryType: "range",
          startedAt: "2026-11-20T08:00:00Z",
          endedAt: "2026-11-20T10:00:00Z",
          createdAt: "2026-11-20T09:30:00Z",
        }),
        makeActivity({ id: 2, title: "Duration task", entryType: "duration", createdAt: "2026-11-20T11:00:00Z" }),
      ],
      [],
    );
    expect(items.map((i) => (i.kind === "activity" ? i.activity.title : ""))).toEqual([
      "Duration task",
      "Range task",
    ]);
  });

  it("leads with a backdated expense the user recorded last", () => {
    // Recorded on 2026-11-20 but dated 2026-11-19 — still the newest record.
    const items = mergeRecent(
      [
        makeActivity({
          id: 1,
          title: "Today range",
          occurredOn: "2026-11-20",
          startedAt: "2026-11-20T07:00:00Z",
          endedAt: "2026-11-20T09:00:00Z",
          createdAt: "2026-11-20T07:30:00Z",
        }),
      ],
      [makeExpense({ id: 3, title: "Backdated expense", occurredOn: "2026-11-19", createdAt: "2026-11-20T18:00:00Z" })],
    );
    expect(items.map((i) => (i.kind === "expense" ? i.expense.title : i.activity.title))).toEqual([
      "Backdated expense",
      "Today range",
    ]);
  });

  it("keeps identical creation timestamps in a stable order", () => {
    const items = mergeRecent(
      [makeActivity({ id: 1, title: "Task", createdAt: "2026-11-20T10:00:00Z" })],
      [makeExpense({ id: 2, title: "Expense", createdAt: "2026-11-20T10:00:00Z" })],
    );
    expect(items.map((i) => i.kind)).toEqual(["activity", "expense"]);
  });
});
