/** Locale-aware formatting helpers for durations, dates and numbers. */

import type { Language } from "@ryty/shared";

function numberFormatter(language: Language, options?: Intl.NumberFormatOptions): Intl.NumberFormat {
  try {
    return new Intl.NumberFormat(language === "fa" ? "fa" : "en", options);
  } catch {
    return new Intl.NumberFormat("en", options);
  }
}

const twoDigitCache = new Map<Language, Intl.NumberFormat>();

function digits(value: number, language: Language): string {
  let fmt = twoDigitCache.get(language);
  if (!fmt) {
    fmt = numberFormatter(language, { minimumIntegerDigits: 2 });
    twoDigitCache.set(language, fmt);
  }
  return fmt.format(value);
}

/** "2:05" or "1:02:03" (hours always shown; seconds under a minute only). */
export function formatDuration(totalSeconds: number, language: Language): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h === 0 && m < 1) {
    return `${digits(sec, language)}${language === "fa" ? " ثانیه" : "s"}`;
  }
  if (h === 0) {
    return `${digits(m, language)}:${digits(sec, language)}`;
  }
  return `${digits(h, language)}:${digits(m, language)}:${digits(sec, language)}`;
}

/** Compact human duration: "3h 25m" / "۴۵ دقیقه". */
export function formatDurationCompact(totalSeconds: number, language: Language): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h === 0 && m === 0) {
    return language === "fa" ? `${digits(s, language)} ثانیه` : `${digits(s, language)}s`;
  }
  if (h === 0) {
    return language === "fa" ? `${digits(m, language)} دقیقه` : `${digits(m, language)}m`;
  }
  return language === "fa"
    ? `${digits(h, language)} ساعت${m > 0 ? ` و ${digits(m, language)} دقیقه` : ""}`
    : `${h}h${m > 0 ? ` ${m}m` : ""}`;
}

/**
 * Localized calendar date for a local YYYY-MM-DD string (no TZ math).
 * `dateFormat` switches the display calendar (Jalali / Gregorian); the
 * underlying data always stays Gregorian ISO.
 */
export function formatLocalDate(
  date: string,
  language: Language,
  /** Date field options; `year: false` omits the year (compact labels). */
  opts?: Omit<Intl.DateTimeFormatOptions, "year"> & {
    year?: Intl.DateTimeFormatOptions["year"] | false;
  },
  dateFormat: "gregorian" | "jalali" = "gregorian",
): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  // Force the calendar explicitly: fa-IR would otherwise default to the
  // Persian calendar even when the Gregorian display setting is chosen.
  const calendar = dateFormat === "jalali" ? "-u-ca-persian" : "-u-ca-gregory";
  try {
    return new Intl.DateTimeFormat((language === "fa" ? "fa-IR" : "en-US") + calendar, {
      timeZone: "UTC",
      weekday: opts?.weekday,
      year: opts?.year === false ? undefined : (opts?.year ?? "numeric"),
      month: opts?.month ?? "short",
      day: opts?.day ?? "numeric",
      numberingSystem: language === "fa" ? "arabext" : "latn",
    }).format(dt);
  } catch {
    return date;
  }
}

/** Today's date formatted with the app-wide display calendar. */
export function formatToday(timezone: string, language: Language, dateFormat: "gregorian" | "jalali"): string {
  return formatLocalDate(todayIn(timezone), language, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }, dateFormat);
}

/** Localized wall-clock time for a local "YYYY-MM-DDTHH:mm" string. */
export function formatLocalTime(local: string, language: Language): string {
  const hhmm = local.slice(11, 16);
  const [h, m] = hhmm.split(":").map(Number);
  return `${digits(h, language)}:${digits(m, language)}`;
}

/** Localized range like "9:00 – 11:30" from ISO UTC instants in a timezone. */
export function formatUtcRange(
  startIso: string | null,
  endIso: string | null,
  timezone: string,
  language: Language,
): string {
  if (!startIso || !endIso) return "";
  const fmt = (iso: string) => {
    try {
      return new Intl.DateTimeFormat(language === "fa" ? "fa-IR" : "en-US", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        numberingSystem: language === "fa" ? "arabext" : "latn",
      }).format(new Date(iso));
    } catch {
      return "";
    }
  };
  return `${fmt(startIso)} – ${fmt(endIso)}`;
}


/**
 * Format an amount given in minor units, e.g. 1234567 → "12,345.67".
 * Trailing zeros are trimmed so TMN/IRR amounts read as plain integers.
 */
export function formatAmount(amountMinor: number, language: Language): string {
  const value = amountMinor / 100;
  const trimmed = Math.abs(value % 1) < 0.005 ? Math.round(value) : value;
  try {
    return numberFormatter(language, {
      minimumFractionDigits: 0,
      maximumFractionDigits: Number.isInteger(trimmed) ? 0 : 2,
    }).format(trimmed);
  } catch {
    return String(trimmed);
  }
}

/** Parse a user-typed decimal amount into minor units (or null). */
export function parseAmountToMinor(input: string): number | null {
  const normalized = input.trim().replace(/[^0-9.]/g, "");
  if (!normalized || Number.isNaN(Number(normalized))) return null;
  const minor = Math.round(Number(normalized) * 100);
  return Number.isFinite(minor) && minor > 0 ? minor : null;
}

/**
 * Normalise a user-typed amount for display in an input: strip everything
 * but digits and dots, then group the integer part in thousands with ",".
 * Typing stays ASCII so `parseAmountToMinor` can consume the value as-is.
 * "1234567.8" → "1,234,567.8"; "12." keeps its trailing dot mid-typing.
 */
export function formatAmountInput(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  const dot = cleaned.indexOf(".");
  const int = dot === -1 ? cleaned : cleaned.slice(0, dot);
  const frac = dot === -1 ? "" : cleaned.slice(dot + 1).replace(/\./g, "");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (dot === -1) return grouped;
  return frac ? `${grouped}.${frac}` : `${grouped}.`;
}

/** Greeting key by local hour in the user timezone. */export function greetingByHour(hour: number): "morning" | "afternoon" | "evening" {
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

export function localHourIn(timezone: string): number {
  try {
    return Number(
      new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "2-digit", hourCycle: "h23" })
        .format(new Date()),
    );
  } catch {
    return new Date().getHours();
  }
}

/** Today's local YYYY-MM-DD in a timezone. */
export function todayIn(timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
    return parts;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/** Convert local wall-clock "YYYY-MM-DDTHH:mm" to a UTC ISO string. */
export function zonedTimeToUtcIso(local: string, timezone: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  const naive = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
  const offset = (date: Date): number => {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const parts: Record<string, number> = {};
    for (const p of dtf.formatToParts(date)) {
      if (p.type !== "literal") parts[p.type] = Number(p.value);
    }
    return (
      Date.UTC(parts.year ?? 1970, (parts.month ?? 1) - 1, parts.day ?? 1, parts.hour ?? 0, parts.minute ?? 0, parts.second ?? 0) -
      date.getTime()
    );
  };
  let ts = naive - offset(new Date(naive));
  ts = naive - offset(new Date(ts));
  return new Date(ts).toISOString();
}

/** Convert a UTC ISO instant to local wall-clock "YYYY-MM-DDTHH:mm" in tz. */
export function utcToZonedLocalInput(iso: string, timezone: string): string {
  try {
    const d = new Date(iso);
    const parts: Record<string, string> = {};
    for (const p of new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(d)) {
      if (p.type !== "literal") parts[p.type] = p.value;
    }
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  } catch {
    return iso.slice(0, 16);
  }
}
