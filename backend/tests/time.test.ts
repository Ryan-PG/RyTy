import { describe, it, expect } from "vitest";
import {
  zonedTimeToUtc,
  utcToZonedLocal,
  occurredOn,
  isValidTimezone,
  isoWeekStart,
  monthStart,
  secondsToHoursMinutes,
} from "../src/utils/time";

describe("timezone utilities", () => {
  it("validates timezone identifiers", () => {
    expect(isValidTimezone("UTC")).toBe(true);
    expect(isValidTimezone("Asia/Tehran")).toBe(true);
    expect(isValidTimezone("Not/AZone")).toBe(false);
  });

  it("converts wall-clock Tehran (+03:30) to UTC", () => {
    // 2026-07-01 12:00 in Tehran = 08:30 UTC
    const utc = zonedTimeToUtc("2026-07-01T12:00", "Asia/Tehran");
    expect(utc?.toISOString()).toBe("2026-07-01T08:30:00.000Z");
  });

  it("converts wall-clock UTC to UTC", () => {
    const utc = zonedTimeToUtc("2026-01-01T00:00", "UTC");
    expect(utc?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("formats UTC instants back to local wall-clock", () => {
    const local = utcToZonedLocal("2026-07-01T08:30:00.000Z", "Asia/Tehran");
    expect(local).toBe("2026-07-01T12:00");
  });

  it("derives occurred_on across date boundaries (Tehran is +03:30)", () => {
    // 2026-07-01 20:30 UTC is already 2026-07-02 00:00 in Tehran
    expect(occurredOn("2026-07-01T20:30:00.000Z", "Asia/Tehran")).toBe("2026-07-02");
    expect(occurredOn("2026-07-01T20:30:00.000Z", "UTC")).toBe("2026-07-01");
  });

  it("returns null for invalid local input", () => {
    expect(zonedTimeToUtc("not-a-date", "UTC")).toBeNull();
  });
});

describe("period helpers", () => {
  it("finds Monday as ISO week start", () => {
    // 2026-11-18 is a Wednesday; the week starts Monday 2026-11-16.
    expect(isoWeekStart("2026-11-18")).toBe("2026-11-16");
    expect(isoWeekStart("2026-11-16")).toBe("2026-11-16");
    // Sunday 2026-11-22 belongs to the same ISO week.
    expect(isoWeekStart("2026-11-22")).toBe("2026-11-16");
  });

  it("finds the first day of a month", () => {
    expect(monthStart("2026-11-19")).toBe("2026-11-01");
  });

  it("formats seconds as h:mm", () => {
    expect(secondsToHoursMinutes(5400)).toBe("1:30");
    expect(secondsToHoursMinutes(0)).toBe("0:00");
  });
});
