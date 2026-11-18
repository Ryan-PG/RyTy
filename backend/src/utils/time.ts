/** Timezone-aware date/time helpers shared by the backend services. */

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getPartsFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = partsFormatterCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsFormatterCache.set(timeZone, fmt);
  }
  return fmt;
}

/** Returns true when the string is a valid IANA timezone identifier. */
export function isValidTimezone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Offset (ms) of `timeZone` at the instant `date`. */
function getOffsetMs(date: Date, timeZone: string): number {
  const parts = getPartsFormatter(timeZone).formatToParts(date);
  const map: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = Number(part.value);
  }
  const asUtc = Date.UTC(
    map.year ?? 1970,
    (map.month ?? 1) - 1,
    map.day ?? 1,
    map.hour ?? 0,
    map.minute ?? 0,
    map.second ?? 0,
  );
  return asUtc - date.getTime();
}

/** Interpret a wall-clock time in `timeZone` and return the UTC instant. */
export function zonedTimeToUtc(local: string, timeZone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const naive = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0));
  // Refine once to handle DST boundaries.
  let ts = naive - getOffsetMs(new Date(naive), timeZone);
  ts = naive - getOffsetMs(new Date(ts), timeZone);
  return new Date(ts);
}

/** Format a UTC instant as local wall-clock "YYYY-MM-DDTHH:mm". */
export function utcToZonedLocal(instant: Date | string, timeZone: string): string {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  const parts = getPartsFormatter(timeZone).formatToParts(date);
  const map: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = Number(part.value);
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${map.year}-${pad(map.month)}-${pad(map.day)}T${pad(map.hour)}:${pad(map.minute)}`;
}

/** Local calendar date (YYYY-MM-DD) of a UTC instant in `timeZone`. */
export function occurredOn(instant: Date | string, timeZone: string): string {
  return utcToZonedLocal(instant, timeZone).slice(0, 10);
}

/** Today's local date (YYYY-MM-DD) in `timeZone`. */
export function todayIn(timeZone: string): string {
  return occurredOn(new Date(), timeZone);
}

export function isoNow(): string {
  return new Date().toISOString();
}

/** UTC instant of local midnight for `date` (YYYY-MM-DD) in `timeZone`. */
export function zonedDayStart(date: string, timeZone: string): Date {
  return zonedTimeToUtc(`${date}T00:00`, timeZone) ?? new Date(date);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86400000);
}

/**
 * Monday-based start of the ISO week containing `date` (local calendar
 * date string in `timeZone`).
 */
export function isoWeekStart(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay(); // 0 = Sunday
  const diff = day === 0 ? 6 : day - 1;
  dt.setUTCDate(dt.getUTCDate() - diff);
  return dt.toISOString().slice(0, 10);
}

/** First day of the month containing `date` (YYYY-MM-DD). */
export function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/**
 * Local end of the last day of the month containing `date` (exclusive
 * upper bound as a UTC instant).
 */
export function zonedMonthEndExclusive(date: string, timeZone: string): Date {
  const [y, m] = date.split("-").map(Number);
  const firstNext = new Date(Date.UTC(y, m, 1)); // first day of next month
  const nextLocal = occurredOn(firstNext, timeZone);
  return zonedDayStart(nextLocal, timeZone);
}

/** Format seconds as h:mm (e.g. 7h30) — used by CSV export. */
export function secondsToHoursMinutes(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}
