import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { CalendarDays, CalendarRange, Pause, Play, Square, Timer } from "lucide-react";
import type { Expense } from "@ryty/shared";
import { api } from "../services/api";
import { useAuth } from "../stores/AuthContext";
import { useProjects } from "../stores/ProjectsContext";
import { useTimer } from "../stores/TimerContext";
import { useToast } from "../stores/ToastContext";
import { Badge, Button, Card, ConfirmDialog, Input, Segmented, Spinner, Textarea } from "../components/ui";
import { ActivityFormModal } from "../components/ActivityFormModal";
import { ExpenseSection } from "../components/ExpenseSection";
import { RecentList } from "../components/RecentList";
import { ProjectPicker } from "../components/ProjectPicker";
import { TagInput } from "../components/TagInput";
import { CoopPicker } from "../components/CoopPicker";
import { formatDuration, formatDurationCompact, formatToday, greetingByHour, localHourIn, todayIn } from "../utils/format";
import { mergeRecent, type RecentItem } from "../utils/recent";

/** Rows shown in the Home "Recent" timeline. */
const RECENT_LIMIT = 20;

/**
 * Home screen: quick activity entry first. Manual-entry modes lead, the
 * timer input follows, and a single mixed "Recent" timeline (today's
 * tasks and expenses) supports both entry tabs. Nothing else competes.
 */
export function DashboardPage() {
  const { t } = useTranslation();
  const { user, language } = useAuth();
  const { defaultProject } = useProjects();
  const { active, elapsed, loading, start, pause, resume, stop, cancel } = useTimer();
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [showDescription, setShowDescription] = useState(false);
  const [projectId, setProjectId] = useState<number | null | undefined>(undefined);
  const [tags, setTags] = useState<string[]>([]);
  const [cooperatorIds, setCooperatorIds] = useState<number[]>([]);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [entryTab, setEntryTab] = useState<"task" | "expense">("task");

  const [today, setToday] = useState<{ totalSeconds: number; count: number } | null>(null);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [recentFromPast, setRecentFromPast] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [initialMode, setInitialMode] = useState<"range" | "duration">("range");
  const [expenseEditRequest, setExpenseEditRequest] = useState<Expense | null>(null);

  const timezone = user?.timezone ?? "UTC";

  const loadSummary = useCallback(async () => {
    try {
      const date = todayIn(timezone);
      const summary = await api.reportSummary({ from: date, to: date });
      setToday({ totalSeconds: summary.totalSeconds, count: summary.activityCount });
    } catch {
      // today's total is non-critical
    }
  }, [timezone]);

  const loadRecent = useCallback(async () => {
    try {
      const date = todayIn(timezone);
      const [acts, exps] = await Promise.all([
        api.listActivities({ page: 1, pageSize: RECENT_LIMIT, from: date, to: date }),
        api.listExpenses({ page: 1, pageSize: RECENT_LIMIT, from: date, to: date }),
      ]);
      let items = mergeRecent(acts.data, exps.data);
      let fromPast = false;
      // Nothing recorded today → fall back to the latest entries, any day.
      if (items.length === 0) {
        const [latestActs, latestExps] = await Promise.all([
          api.listActivities({ page: 1, pageSize: RECENT_LIMIT }),
          api.listExpenses({ page: 1, pageSize: RECENT_LIMIT }),
        ]);
        items = mergeRecent(latestActs.data, latestExps.data);
        fromPast = true;
      }
      setRecent(items.slice(0, RECENT_LIMIT));
      setRecentFromPast(fromPast);
    } catch {
      // the recent list is non-critical
    }
  }, [timezone]);

  useEffect(() => {
    void loadSummary();
    void loadRecent();
  }, [loadSummary, loadRecent]);

  // Refresh totals and the recent list when a timer is stopped or cancelled.
  useEffect(() => {
    if (!active) {
      void loadSummary();
      void loadRecent();
    }
  }, [active, loadSummary, loadRecent]);

  const onStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setStarting(true);
    try {
      const effectiveProjectId = projectId === undefined ? (defaultProject?.id ?? null) : projectId;
      await start(
        title.trim(),
        description.trim() || undefined,
        effectiveProjectId,
        tags,
        cooperatorIds,
      );
      setTitle("");
      setDescription("");
      setTags([]);
      setCooperatorIds([]);
      setShowDescription(false);
    } catch {
      toast(t("common.errorGeneric"), "error");
    } finally {
      setStarting(false);
    }
  };

  const onStop = async () => {
    setStopping(true);
    try {
      await stop();
      toast(t("dashboard.timerSaved"));
    } catch (err) {
      toast(t("common.errorGeneric"), "error");
    } finally {
      setStopping(false);
    }
  };

  const onCancel = async () => {
    setCancelling(true);
    try {
      await cancel();
      toast(t("dashboard.timerCancelled"));
      setCancelOpen(false);
    } catch {
      toast(t("common.errorGeneric"), "error");
    } finally {
      setCancelling(false);
    }
  };

  const hourOfDay = greetingByHour(localHourIn(timezone));
  const greeting = t(
    hourOfDay === "morning"
      ? "dashboard.greetingMorning"
      : hourOfDay === "afternoon"
        ? "dashboard.greetingAfternoon"
        : "dashboard.greetingEvening",
  );

  const openManual = (mode: "range" | "duration") => {
    setInitialMode(mode);
    setManualOpen(true);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">
            {greeting}
            {user ? `, ${user.username}` : ""}
          </h1>
          {/* Today's date in the calendar chosen in Admin → Settings. */}
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
            <CalendarDays className="size-4 shrink-0" aria-hidden />
            {formatToday(timezone, language, user?.dateFormat ?? "gregorian")}
          </p>
        </div>
        {today && (
          <div className="shrink-0 text-sm text-muted">
            <span className="font-semibold text-text tabular">
              {formatDurationCompact(today.totalSeconds, language)}
            </span>{" "}
            ·{" "}
            {today.count === 1
              ? t("dashboard.oneActivity")
              : t("dashboard.todayActivities", { count: today.count })}
          </div>
        )}
      </div>

      {/* Entry tabs: task (timer / manual) or expense */}
      <div>
        <Segmented<"task" | "expense">
          ariaLabel={t("dashboard.entryTabs")}
          value={entryTab}
          onChange={setEntryTab}
          options={[
            { value: "task", label: t("dashboard.taskTab") },
            { value: "expense", label: t("dashboard.expenseTab") },
          ]}
        />
      </div>

      {entryTab === "expense" ? (
        <ExpenseSection
          editRequest={expenseEditRequest}
          onEditConsumed={() => setExpenseEditRequest(null)}
          onChanged={() => void loadRecent()}
        />
      ) : (
        <>
      {/* Manual entry modes: big, icon-led choices above the timer. */}
      <div role="group" aria-label={t("dashboard.manualEntryTitle")} className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className="flex h-14 items-center justify-center gap-3 rounded-[var(--radius-lg)] border border-border bg-surface px-3 text-sm font-medium text-text transition-colors hover:border-border-strong hover:bg-surface-2"
          onClick={() => openManual("duration")}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius)] bg-accent-soft text-accent">
            <Timer className="size-4.5" aria-hidden />
          </span>
          {t("dashboard.durationEntry")}
        </button>
        <button
          type="button"
          className="flex h-14 items-center justify-center gap-3 rounded-[var(--radius-lg)] border border-border bg-surface px-3 text-sm font-medium text-text transition-colors hover:border-border-strong hover:bg-surface-2"
          onClick={() => openManual("range")}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius)] bg-accent-soft text-accent">
            <CalendarRange className="size-4.5" aria-hidden />
          </span>
          {t("dashboard.rangeEntry")}
        </button>
      </div>

      {/* Primary action: timer */}
      {loading ? (
        <Card className="flex items-center justify-center p-6">
          <Spinner className="size-5 text-muted" />
        </Card>
      ) : active ? (
        <Card className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Badge tone={active.state === "running" ? "accent" : "warning"}>
                {active.state === "running" ? t("dashboard.timerRunning") : t("dashboard.timerPaused")}
              </Badge>
              <p className="mt-2 truncate text-base font-medium text-text">{active.title}</p>
            </div>
            <div className="text-end">
              <div className="text-3xl font-semibold tabular" dir="ltr">
                {formatDuration(elapsed, language)}
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {active.state === "running" ? (
              <Button variant="secondary" onClick={() => void pause()}>
                <Pause className="size-4" aria-hidden />
                {t("dashboard.pause")}
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => void resume()}>
                <Play className="size-4" aria-hidden />
                {t("dashboard.resume")}
              </Button>
            )}
            <Button variant="danger" loading={stopping} onClick={() => void onStop()}>
              <Square className="size-4" aria-hidden />
              {t("dashboard.stop")}
            </Button>
            <Button variant="ghost" onClick={() => setCancelOpen(true)}>
              {t("dashboard.cancelTimer")}
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="p-4">
          <form onSubmit={onStart}>
            <label htmlFor="timer-title" className="text-sm font-medium text-text">
              {t("dashboard.whatAreYouWorkingOn")}
            </label>
            <div className="mt-2 flex gap-2">
              <Input
                id="timer-title"
                value={title}
                maxLength={200}
                placeholder={t("dashboard.activityTitlePlaceholder")}
                onChange={(e) => setTitle(e.target.value)}
              />
              <Button type="submit" loading={starting} disabled={!title.trim()} className="shrink-0">
                {t("dashboard.startTimer")}
              </Button>
            </div>
            {showDescription && (
              <Textarea
                className="mt-2"
                value={description}
                maxLength={2000}
                placeholder={t("dashboard.descriptionPlaceholder")}
                onChange={(e) => setDescription(e.target.value)}
              />
            )}
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <ProjectPicker
                value={projectId === undefined ? (defaultProject?.id ?? null) : projectId}
                onChange={(id) => setProjectId(id)}
                ariaLabel={t("projects.title")}
              />
              <div className="min-w-40 flex-1">
                <TagInput
                  value={tags}
                  onChange={setTags}
                  placeholder={t("tags.placeholderShort")}
                  ariaLabel={t("tags.title")}
                />
              </div>
              <div className="min-w-40 flex-1">
                <CoopPicker
                  value={cooperatorIds}
                  onChange={setCooperatorIds}
                  ownerId={user?.id}
                  placeholder={t("coops.placeholderShort")}
                  ariaLabel={t("coops.title")}
                />
              </div>
              {!showDescription && (
                <button
                  type="button"
                  className="text-xs text-muted hover:text-text"
                  onClick={() => setShowDescription(true)}
                >
                  {t("dashboard.addDescription")}
                </button>
              )}
            </div>
          </form>
        </Card>
      )}

      <ActivityFormModal
        open={manualOpen}
        onClose={() => {
          setManualOpen(false);
          void loadRecent();
          void loadSummary();
        }}
        initialMode={initialMode}
      />
        </>
      )}

      {/* Recent: today's tasks and expenses, identical on both entry tabs.
          Falls back to the latest entries when nothing was recorded today. */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted">{t("dashboard.recent")}</h2>
          <Link to="/activities" className="text-sm text-accent hover:underline">
            {t("dashboard.viewAll")}
          </Link>
        </div>
        <RecentList
          items={recent}
          timezone={timezone}
          showDates={recentFromPast}
          onEditExpense={(expense) => {
            setEntryTab("expense");
            setExpenseEditRequest(expense);
          }}
          onChanged={() => void loadRecent()}
        />
      </section>

      <ConfirmDialog
        open={cancelOpen}
        title={t("dashboard.cancelTimerTitle")}
        message={t("dashboard.cancelTimerMessage", { title: active?.title ?? "" })}
        confirmLabel={t("dashboard.cancelTimer")}
        cancelLabel={t("common.cancel")}
        destructive
        loading={cancelling}
        onConfirm={() => void onCancel()}
        onCancel={() => setCancelOpen(false)}
      />
    </div>
  );
}
