import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import type { ReportSummary } from "@ryty/shared";
import { api } from "../services/api";
import { useAuth } from "../stores/AuthContext";
import { Button, Card, EmptyState, Input, Segmented, Select, Spinner } from "../components/ui";
import { formatDurationCompact, formatLocalDate, todayIn } from "../utils/format";

type Mode = "daily" | "weekly" | "monthly" | "custom";

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isoWeekStart(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (day === 0 ? 6 : day - 1));
  return d.toISOString().slice(0, 10);
}

/** Compute the [from, to] range for the selected report mode. */
function rangeFor(mode: Mode, date: string, customFrom: string, customTo: string): { from: string; to: string } {
  switch (mode) {
    case "daily":
      return { from: date, to: date };
    case "weekly": {
      const from = isoWeekStart(date);
      return { from, to: shiftDate(from, 6) };
    }
    case "monthly": {
      const from = `${date.slice(0, 7)}-01`;
      const d = new Date(`${date.slice(0, 7)}-01T12:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() + 1);
      d.setUTCDate(0);
      return { from, to: d.toISOString().slice(0, 10) };
    }
    case "custom":
      return { from: customFrom || isoToday(), to: customTo || isoToday() };
  }
}

/** Reports: period summaries, per-user/per-project breakdowns, CSV export. */
export function ReportsPage() {
  const { t } = useTranslation();
  const { user, language } = useAuth();

  const timezone = user?.timezone ?? "UTC";
  const [mode, setMode] = useState<Mode>("weekly");
  const [date, setDate] = useState(() => todayIn(user?.timezone ?? "UTC"));
  const [customFrom, setCustomFrom] = useState(() => todayIn(user?.timezone ?? "UTC"));
  const [customTo, setCustomTo] = useState(() => todayIn(user?.timezone ?? "UTC"));
  const [userId, setUserId] = useState<number | undefined>(undefined);
  const [users, setUsers] = useState<{ id: number; username: string }[]>([]);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  /** Rolling window: the past 7 days, independent of the selected period. */
  const [last7, setLast7] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const canFilterByUser = user?.role === "admin" || user?.reportsVisibility === "all_users";

  useEffect(() => {
    // Load the user filter list when the viewer may see other users.
    void (async () => {
      try {
        setUsers(await api.listUsersForFilter());
      } catch {
        setUsers([]);
      }
    })();
  }, []);

  const range = useMemo(() => rangeFor(mode, date, customFrom, customTo), [mode, date, customFrom, customTo]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSummary(await api.reportSummary({ ...range, userId }));
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  // The past-7-days window is fixed: [today - 6, today] in the user timezone.
  useEffect(() => {
    void (async () => {
      const today = todayIn(timezone);
      const from = shiftDate(today, -6);
      try {
        setLast7(await api.reportSummary({ from, to: today }));
      } catch {
        setLast7(null);
      }
    })();
  }, [timezone]);

  const last7Days = useMemo(() => {
    // Exactly seven rows (ascending), zero-filled for quiet empty days.
    if (!last7) return [];
    const today = todayIn(timezone);
    const totals = new Map(last7.byDay.map((d) => [d.date, d.totalSeconds]));
    const counts = new Map(last7.byDay.map((d) => [d.date, d.count]));
    return Array.from({ length: 7 }, (_, i) => {
      const day = shiftDate(today, i - 6);
      return { date: day, totalSeconds: totals.get(day) ?? 0, count: counts.get(day) ?? 0 };
    });
  }, [last7, timezone]);

  const shift = (direction: 1 | -1) => {
    const step = mode === "daily" ? 1 : mode === "weekly" ? 7 : mode === "monthly" ? 0 : 0;
    if (mode === "monthly") {
      const d = new Date(`${date}T12:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() + direction);
      setDate(d.toISOString().slice(0, 10));
      return;
    }
    setDate(shiftDate(date, direction * (step || 1)));
  };

  const periodLabel = () => {
    const opts: Intl.DateTimeFormatOptions = mode === "monthly" ? { year: "numeric", month: "long" } : { weekday: mode === "daily" ? "long" : undefined, year: "numeric", month: "short", day: "numeric" };
    if (mode === "daily") return formatLocalDate(date, language, opts);
    return `${formatLocalDate(range.from, language, opts)} — ${formatLocalDate(range.to, language, opts)}`;
  };

  const maxDaySeconds = Math.max(1, ...last7Days.map((d) => d.totalSeconds));

  const exportHref = api.exportCsvUrl({ ...range, userId });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">{t("reports.title")}</h1>
        <Button variant="secondary" href={exportHref} download>
          <Download className="size-4" aria-hidden />
          {t("reports.exportCsv")}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Segmented<Mode>
          ariaLabel={t("reports.title")}
          value={mode}
          onChange={setMode}
          options={[
            { value: "daily", label: t("reports.daily") },
            { value: "weekly", label: t("reports.weekly") },
            { value: "monthly", label: t("reports.monthly") },
            { value: "custom", label: t("reports.custom") },
          ]}
        />
        {mode !== "custom" ? (
          <div className="flex items-center gap-1">
            <Button variant="ghost" onClick={() => shift(-1)} aria-label="Previous">
              <ChevronLeft className="size-4" />
            </Button>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-36" />
            <Button variant="ghost" onClick={() => shift(1)} aria-label="Next">
              <ChevronRight className="size-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Input type="date" aria-label={t("common.from")} value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-36" />
            <span className="text-faint">–</span>
            <Input type="date" aria-label={t("common.to")} value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-36" />
          </div>
        )}
        {canFilterByUser && (
          <Select
            aria-label={t("reports.userFilter")}
            value={userId ?? ""}
            onChange={(e) => setUserId(e.target.value ? Number(e.target.value) : undefined)}
            className="w-40"
          >
            <option value="">{t("common.allUsers")}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.username}
              </option>
            ))}
          </Select>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner className="size-5 text-muted" />
        </div>
      ) : !summary || summary.activityCount === 0 ? (
        <EmptyState title={t("reports.empty")} />
      ) : (
        <>
          <p className="text-sm text-muted">{periodLabel()}</p>

          {/* Summary numbers */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="p-3.5">
              <p className="text-xs font-medium text-muted">{t("reports.totalTime")}</p>
              <p className="mt-1 text-2xl font-semibold tabular" dir="ltr">
                {formatDurationCompact(summary.totalSeconds, language)}
              </p>
            </Card>
            <Card className="p-3.5">
              <p className="text-xs font-medium text-muted">{t("reports.activityCount")}</p>
              <p className="mt-1 text-2xl font-semibold tabular">{summary.activityCount}</p>
            </Card>
          </div>

          {/* Per user (when visible) */}
          {summary.byUser.length > 0 && (summary.byUser.length > 1 || userId === undefined) && (
            <Card className="overflow-hidden">
              <h2 className="border-b border-border px-3.5 py-2.5 text-sm font-semibold text-muted">{t("reports.perUser")}</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-faint">
                    <th className="px-3.5 py-1.5 text-start font-medium">{t("reports.byUser")}</th>
                    <th className="px-3.5 py-1.5 text-end font-medium">{t("reports.count")}</th>
                    <th className="px-3.5 py-1.5 text-end font-medium">{t("reports.totalTime")}</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byUser.map((u) => (
                    <tr key={u.userId} className="border-b border-border last:border-0">
                      <td className="px-3.5 py-2 font-medium">{u.username}</td>
                      <td className="px-3.5 py-2 text-end text-muted tabular">{u.count}</td>
                      <td className="px-3.5 py-2 text-end font-medium tabular" dir="ltr">
                        {formatDurationCompact(u.totalSeconds, language)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {/* Per project (when visible) */}
          {summary.byProject.length > 1 && (
            <Card className="overflow-hidden">
              <h2 className="border-b border-border px-3.5 py-2.5 text-sm font-semibold text-muted">{t("reports.perProject")}</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-faint">
                    <th className="px-3.5 py-1.5 text-start font-medium">{t("projects.title")}</th>
                    <th className="px-3.5 py-1.5 text-end font-medium">{t("reports.count")}</th>
                    <th className="px-3.5 py-1.5 text-end font-medium">{t("reports.totalTime")}</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byProject.map((p) => (
                    <tr key={p.projectId ?? "none"} className="border-b border-border last:border-0">
                      <td className="px-3.5 py-2 font-medium">
                        {p.projectName || t("reports.noProject")}
                      </td>
                      <td className="px-3.5 py-2 text-end text-muted tabular">{p.count}</td>
                      <td className="px-3.5 py-2 text-end font-medium tabular" dir="ltr">
                        {formatDurationCompact(p.totalSeconds, language)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

        </>
      )}

      {/* Per day — always exactly the past 7 days, independent of the
          selected period. Quiet horizontal bars, no chart library. */}
      {last7Days.length > 0 && (
        <Card className="p-3.5">
          <div className="mb-2.5 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-muted">{t("reports.perDay")}</h2>
            <span className="text-xs text-faint">{t("reports.last7Days")}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {last7Days.map((d) => (
              <div key={d.date} className="flex items-center gap-2.5">
                <span className="w-28 shrink-0 text-xs text-muted">{formatLocalDate(d.date, language, { weekday: "short", month: "short", day: "numeric" })}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${Math.round((d.totalSeconds / maxDaySeconds) * 100)}%` }}
                  />
                </div>
                <span className="w-16 shrink-0 text-end text-xs font-medium tabular" dir="ltr">
                  {formatDurationCompact(d.totalSeconds, language)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
