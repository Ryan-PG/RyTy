import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Pause, Play, Plus, Square } from "lucide-react";
import type { Activity } from "@ryty/shared";
import { api } from "../services/api";
import { useAuth } from "../stores/AuthContext";
import { useTimer } from "../stores/TimerContext";
import { useToast } from "../stores/ToastContext";
import { Badge, Button, Card, EmptyState, Input, Spinner, Textarea } from "../components/ui";
import { ActivityFormModal } from "../components/ActivityFormModal";
import { ActivityRow } from "../components/ActivityRow";
import { formatDuration, formatDurationCompact, greetingByHour, localHourIn } from "../utils/format";

/**
 * Home screen: quick activity entry first. Timer input leads; manual entry,
 * today's total and recent activities support it. Nothing else competes.
 */
export function DashboardPage() {
  const { t } = useTranslation();
  const { user, language } = useAuth();
  const { active, elapsed, loading, start, pause, resume, stop } = useTimer();
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [showDescription, setShowDescription] = useState(false);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);

  const [today, setToday] = useState<{ totalSeconds: number; count: number } | null>(null);
  const [recent, setRecent] = useState<Activity[]>([]);
  const [manualOpen, setManualOpen] = useState(false);
  const [initialMode, setInitialMode] = useState<"range" | "duration">("range");

  const timezone = user?.timezone ?? "UTC";

  const loadSummary = useCallback(async () => {
    try {
      const date = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
      const summary = await api.reportSummary({ from: date, to: date });
      setToday({ totalSeconds: summary.totalSeconds, count: summary.activityCount });
      const page = await api.listActivities({ page: 1, pageSize: 5 });
      setRecent(page.data);
    } catch {
      // dashboard summary is non-critical
    }
  }, [timezone]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  // Refresh the recent list when a timer is stopped into an activity.
  useEffect(() => {
    if (!active) void loadSummary();
  }, [active, loadSummary]);

  const onStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setStarting(true);
    try {
      await start(title.trim(), description.trim() || undefined);
      setTitle("");
      setDescription("");
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

  const hourOfDay = greetingByHour(localHourIn(timezone));
  const greeting = t(
    hourOfDay === "morning"
      ? "dashboard.greetingMorning"
      : hourOfDay === "afternoon"
        ? "dashboard.greetingAfternoon"
        : "dashboard.greetingEvening",
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-lg font-semibold">
          {greeting}
          {user ? `, ${user.username}` : ""}
        </h1>
        {today && (
          <div className="text-sm text-muted">
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
              <div className="font-mono text-3xl font-semibold tabular" dir="ltr">
                {formatDuration(elapsed, language)}
              </div>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
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
            {showDescription ? (
              <Textarea
                className="mt-2"
                value={description}
                maxLength={2000}
                placeholder={t("dashboard.descriptionPlaceholder")}
                onChange={(e) => setDescription(e.target.value)}
              />
            ) : (
              <button
                type="button"
                className="mt-2 text-xs text-muted hover:text-text"
                onClick={() => setShowDescription(true)}
              >
                {t("dashboard.addDescription")}
              </button>
            )}
          </form>
        </Card>
      )}

      {/* Secondary action: manual entry */}
      <div className="flex gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            setInitialMode("range");
            setManualOpen(true);
          }}
        >
          <Plus className="size-4" aria-hidden />
          {t("dashboard.rangeEntry")}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            setInitialMode("duration");
            setManualOpen(true);
          }}
        >
          <Plus className="size-4" aria-hidden />
          {t("dashboard.durationEntry")}
        </Button>
      </div>

      {/* Recent activities */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted">{t("dashboard.recent")}</h2>
          <Link to="/activities" className="text-sm text-accent hover:underline">
            {t("dashboard.viewAll")}
          </Link>
        </div>
        {recent.length === 0 ? (
          <EmptyState title={t("dashboard.noActivitiesToday")} />
        ) : (
          <Card className="divide-y divide-border overflow-hidden">
            {recent.map((activity) => (
              <ActivityRow key={activity.id} activity={activity} timezone={timezone} />
            ))}
          </Card>
        )}
      </section>

      <ActivityFormModal
        open={manualOpen}
        onClose={() => {
          setManualOpen(false);
          void loadSummary();
        }}
        initialMode={initialMode}
      />
    </div>
  );
}
