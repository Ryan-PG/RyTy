import { describe, it, expect } from "vitest";
import { activitiesToCsv, csvEscape, summarizeActivities } from "../src/services/report";
import type { Activity } from "@ryty/shared";

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: 1,
    userId: 1,
    username: "admin",
    title: "Work",
    description: null,
    entryType: "range",
    startedAt: "2026-11-19T09:00:00.000Z",
    endedAt: "2026-11-19T10:00:00.000Z",
    durationSeconds: 3600,
    occurredOn: "2026-11-19",
    project: null,
    tags: [],
    createdAt: "2026-11-19T10:00:00.000Z",
    updatedAt: "2026-11-19T10:00:00.000Z",
    ...overrides,
  };
}

describe("CSV export", () => {
  it("escapes commas, quotes and newlines", () => {
    expect(csvEscape("plain")).toBe("plain");
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
  });

  it("starts with a UTF-8 BOM and includes headers", () => {
    const csv = activitiesToCsv([]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("occurred_on,username,project,title");
  });

  it("keeps Persian text intact", () => {
    const csv = activitiesToCsv([
      makeActivity({ title: "مطالعه کتاب", description: "فصل اول" }),
    ]);
    expect(csv).toContain("مطالعه کتاب");
    expect(csv).toContain("فصل اول");
  });

  it("uses blank timestamps for duration-only entries", () => {
    const csv = activitiesToCsv([makeActivity({ entryType: "duration", startedAt: null, endedAt: null })]);
    const row = csv.split("\r\n")[1];
    expect(row).toContain("duration");
  });
});

describe("report summarization", () => {
  it("totals and groups by day, user and title", () => {
    const summary = summarizeActivities("2026-11-19", "2026-11-20", [
      makeActivity({ id: 1, occurredOn: "2026-11-19", durationSeconds: 3600 }),
      makeActivity({ id: 2, occurredOn: "2026-11-19", durationSeconds: 1800, title: "Other" }),
      makeActivity({ id: 3, occurredOn: "2026-11-20", durationSeconds: 600, userId: 2, username: "sara" }),
    ]);
    expect(summary.totalSeconds).toBe(6000);
    expect(summary.activityCount).toBe(3);
    expect(summary.byDay).toHaveLength(2);
    expect(summary.byDay[0]).toEqual({ date: "2026-11-19", totalSeconds: 5400, count: 2 });
    expect(summary.byUser).toHaveLength(2);
    expect(summary.byTitle[0].title).toBe("Work"); // largest first
  });
});
