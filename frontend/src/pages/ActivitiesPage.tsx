import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { Activity } from "@ryty/shared";
import { api } from "../services/api";
import { useAuth } from "../stores/AuthContext";
import { useProjects } from "../stores/ProjectsContext";
import { useToast } from "../stores/ToastContext";
import { Button, Card, ConfirmDialog, EmptyState, Input, Select, Spinner } from "../components/ui";
import { ActivityFormModal } from "../components/ActivityFormModal";
import { ActivityRow } from "../components/ActivityRow";
import { formatDurationCompact, formatLocalDate, todayIn } from "../utils/format";

const PAGE_SIZE = 25;

/**
 * Activity history: search + date filters, grouped by local day, with edit
 * and delete actions. "Load more" keeps pagination explicit and calm.
 */
export function ActivitiesPage() {
  const { t } = useTranslation();
  const { user, language } = useAuth();
  const { usable } = useProjects();
  const { toast } = useToast();
  const timezone = user?.timezone ?? "UTC";

  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [deleting, setDeleting] = useState<Activity | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  const filtersKey = useMemo(
    () => `${search}|${from}|${to}|${projectFilter}`,
    [search, from, to, projectFilter],
  );

  const load = useCallback(
    async (targetPage: number, append: boolean) => {
      setLoading(true);
      try {
        const result = await api.listActivities({
          page: targetPage,
          pageSize: PAGE_SIZE,
          q: search.trim() || undefined,
          from: from || undefined,
          to: to || undefined,
          projectId: projectFilter ? Number(projectFilter) : undefined,
        });
        setActivities((prev) => (append ? [...prev, ...result.data] : result.data));
        setTotal(result.total);
        setPage(targetPage);
      } catch {
        toast(t("common.errorGeneric"), "error");
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtersKey],
  );

  useEffect(() => {
    void load(1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);

  const onDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await api.deleteActivity(deleting.id);
      toast(t("dashboard.deleted"));
      setDeleting(null);
      await load(1, false);
    } catch {
      toast(t("common.errorGeneric"), "error");
    } finally {
      setDeleteLoading(false);
    }
  };

  const grouped = useMemo(() => {
    const groups = new Map<string, Activity[]>();
    for (const activity of activities) {
      const list = groups.get(activity.occurredOn) ?? [];
      list.push(activity);
      groups.set(activity.occurredOn, list);
    }
    return [...groups.entries()];
  }, [activities]);

  const dayLabel = (date: string) => {
    const today = todayIn(timezone);
    const yesterdayDate = new Date(`${today}T12:00:00Z`);
    yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
    const yesterday = yesterdayDate.toISOString().slice(0, 10);
    if (date === today) return t("common.today");
    if (date === yesterday) return t("common.yesterday");
    return formatLocalDate(date, language, { weekday: "long" });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">{t("activities.title")}</h1>
        <Button variant="secondary" onClick={() => setManualOpen(true)}>
          <Plus className="size-4" aria-hidden />
          {t("common.addManually")}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="search"
          className="flex-1"
          placeholder={t("activities.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          aria-label={t("reports.userFilter")}
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="sm:w-44"
        >
          <option value="">{t("common.allProjects")}</option>
          {usable.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <div className="flex gap-2">
          <Input
            type="date"
            aria-label={t("common.from")}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <Input
            type="date"
            aria-label={t("common.to")}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      </div>

      {loading && activities.length === 0 ? (
        <div className="flex justify-center py-10">
          <Spinner className="size-5 text-muted" />
        </div>
      ) : grouped.length === 0 ? (
        <EmptyState title={t("activities.empty")} hint={t("activities.emptyHint")} />
      ) : (
        <div className="flex flex-col gap-4">
          {grouped.map(([date, items]) => {
            const dayTotal = items.reduce((sum, a) => sum + a.durationSeconds, 0);
            return (
              <section key={date}>
                <div className="mb-1.5 flex items-baseline justify-between px-1">
                  <h2 className="text-sm font-semibold text-muted">{dayLabel(date)}</h2>
                  <span className="text-xs font-medium text-faint tabular" dir="ltr">
                    {formatDurationCompact(dayTotal, language)}
                  </span>
                </div>
                <Card className="divide-y divide-border overflow-hidden">
                  {items.map((activity) => {
                    const isOwner = activity.userId === user?.id;
                    return (
                      <div key={activity.id} className="group relative">
                        <ActivityRow activity={activity} timezone={timezone} />
                        {isOwner && (
                          <div className="absolute inset-y-0 end-2 flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100">
                            <button
                              type="button"
                              aria-label={t("common.edit")}
                              className="rounded-[var(--radius-sm)] bg-surface p-1.5 text-muted shadow-sm hover:text-text"
                              onClick={() => setEditing(activity)}
                            >
                              <Pencil className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label={t("common.delete")}
                              className="rounded-[var(--radius-sm)] bg-surface p-1.5 text-muted shadow-sm hover:text-danger"
                              onClick={() => setDeleting(activity)}
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </Card>
              </section>
            );
          })}
        </div>
      )}

      {activities.length < total && (
        <div className="flex justify-center">
          <Button variant="secondary" loading={loading} onClick={() => void load(page + 1, true)}>
            {t("common.loadMore")}
          </Button>
        </div>
      )}

      <ActivityFormModal
        open={manualOpen || editing !== null}
        activity={editing}
        onClose={() => {
          setManualOpen(false);
          setEditing(null);
          void load(1, false);
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        title={t("activities.deleteTitle")}
        message={t("activities.deleteMessage", { title: deleting?.title ?? "" })}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        destructive
        loading={deleteLoading}
        onConfirm={() => void onDelete()}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
