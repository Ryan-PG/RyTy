import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { Activity, Expense } from "@ryty/shared";
import { api } from "../services/api";
import { useAuth } from "../stores/AuthContext";
import { useProjects } from "../stores/ProjectsContext";
import { useToast } from "../stores/ToastContext";
import { Button, Card, ConfirmDialog, EmptyState, Input, Select, Spinner } from "../components/ui";
import { ActivityFormModal } from "../components/ActivityFormModal";
import { ActivityRow } from "../components/ActivityRow";
import { ExpenseRow } from "../components/ExpenseRow";
import { formatAmount, formatDurationCompact, formatLocalDate, todayIn } from "../utils/format";
import { mergeRecent, type RecentItem } from "../utils/recent";

const PAGE_SIZE = 25;

/**
 * Activity history: search + date filters, grouped by local day, with edit
 * and delete actions. Expenses share the list — a yellow start edge marks
 * tasks, a blue one marks expenses. "Load more" keeps pagination explicit
 * and calm.
 */
export function ActivitiesPage() {
  const { t } = useTranslation();
  const { user, language } = useAuth();
  const { usable } = useProjects();
  const { toast } = useToast();
  const timezone = user?.timezone ?? "UTC";
  const currency = user?.currency ?? "";
  const canFilterByUser = user?.role === "admin" || user?.reportsVisibility === "all_users";

  useEffect(() => {
    if (!canFilterByUser) return;
    void (async () => {
      try {
        setUsers(await api.listUsersForFilter());
      } catch {
        setUsers([]);
      }
    })();
  }, [canFilterByUser]);

  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [users, setUsers] = useState<{ id: number; username: string }[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [activitiesTotal, setActivitiesTotal] = useState(0);
  const [expensesTotal, setExpensesTotal] = useState(0);
  const [expensesExhausted, setExpensesExhausted] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState<RecentItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  const filtersKey = useMemo(
    () => `${search}|${from}|${to}|${projectFilter}|${userFilter}`,
    [search, from, to, projectFilter, userFilter],
  );

  const load = useCallback(
    async (targetPage: number, append: boolean) => {
      setLoading(true);
      try {
        // Expenses have no project, so a project filter scopes the list to
        // activities. Exhaustion only skips further *append* pages — a fresh
        // load always refetches (filters/results may have changed).
        const includeExpenses = !projectFilter && (!append || !expensesExhausted);
        const common = {
          q: search.trim() || undefined,
          from: from || undefined,
          to: to || undefined,
          userId: userFilter ? Number(userFilter) : undefined,
        };
        const [actRes, expRes] = await Promise.all([
          api.listActivities({
            ...common,
            projectId: projectFilter ? Number(projectFilter) : undefined,
            page: targetPage,
            pageSize: PAGE_SIZE,
          }),
          includeExpenses
            ? api.listExpenses({ ...common, page: targetPage, pageSize: PAGE_SIZE })
            : Promise.resolve(null),
        ]);
        setActivities((prev) => (append ? [...prev, ...actRes.data] : actRes.data));
        setActivitiesTotal(actRes.total);
        if (expRes) {
          setExpenses((prev) => (append ? [...prev, ...expRes.data] : expRes.data));
          setExpensesTotal(expRes.total);
          setExpensesExhausted(expRes.data.length < PAGE_SIZE);
        } else if (!append) {
          setExpenses([]);
          setExpensesTotal(0);
          setExpensesExhausted(true);
        }
        setPage(targetPage);
      } catch {
        toast(t("common.errorGeneric"), "error");
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtersKey, expensesExhausted],
  );

  useEffect(() => {
    void load(1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);

  const onDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      if (deleting.kind === "activity") {
        await api.deleteActivity(deleting.activity.id);
        toast(t("dashboard.deleted"));
      } else {
        await api.deleteExpense(deleting.expense.id);
        toast(t("expenses.deleted"));
      }
      setDeleting(null);
      await load(1, false);
    } catch {
      toast(t("common.errorGeneric"), "error");
    } finally {
      setDeleteLoading(false);
    }
  };

  const grouped = useMemo(() => {
    const groups = new Map<string, RecentItem[]>();
    for (const item of mergeRecent(activities, expenses)) {
      const date = item.kind === "activity" ? item.activity.occurredOn : item.expense.occurredOn;
      const list = groups.get(date) ?? [];
      list.push(item);
      groups.set(date, list);
    }
    return [...groups.entries()];
  }, [activities, expenses]);

  const hasMore = activities.length < activitiesTotal || expenses.length < expensesTotal;

  const dayLabel = (date: string) => {
    const today = todayIn(timezone);
    const yesterdayDate = new Date(`${today}T12:00:00Z`);
    yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
    const yesterday = yesterdayDate.toISOString().slice(0, 10);
    if (date === today) return t("common.today");
    if (date === yesterday) return t("common.yesterday");
    return formatLocalDate(date, language, { weekday: "long" }, user?.dateFormat ?? "gregorian");
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
          aria-label={t("projects.title")}
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="sm:w-44"
        >
          <option value="">{t("common.allProjects")}</option>
          <option value="0">{t("projects.noProject")}</option>
          {usable.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        {canFilterByUser && (
          <Select
            aria-label={t("reports.userFilter")}
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            className="sm:w-40"
          >
            <option value="">{t("common.allUsers")}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.username}
              </option>
            ))}
          </Select>
        )}
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

      {loading && activities.length === 0 && expenses.length === 0 ? (
        <div className="flex justify-center py-10">
          <Spinner className="size-5 text-muted" />
        </div>
      ) : grouped.length === 0 ? (
        <EmptyState title={t("activities.empty")} hint={t("activities.emptyHint")} />
      ) : (
        <div className="flex flex-col gap-4">
          {grouped.map(([date, items]) => {
            const daySeconds = items.reduce(
              (sum, item) => (item.kind === "activity" ? sum + item.activity.durationSeconds : sum),
              0,
            );
            const dayExpense = items.reduce(
              (sum, item) => (item.kind === "expense" ? sum + item.expense.amountMinor : sum),
              0,
            );
            const dayTotals = [
              daySeconds > 0 ? formatDurationCompact(daySeconds, language) : null,
              dayExpense > 0 ? `${formatAmount(dayExpense, language)} ${currency}` : null,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <section key={date}>
                <div className="mb-1.5 flex items-baseline justify-between px-1">
                  <h2 className="text-sm font-semibold text-muted">{dayLabel(date)}</h2>
                  {dayTotals && (
                    <span className="text-xs font-medium text-faint tabular" dir="ltr">
                      {dayTotals}
                    </span>
                  )}
                </div>
                <Card className="divide-y divide-border overflow-hidden">
                  {items.map((item) => {
                    if (item.kind === "activity") {
                      const activity = item.activity;
                      // The owner and any co-doer may edit or delete.
                      const canEdit =
                        activity.userId === user?.id ||
                        activity.cooperators.some((c) => c.id === user?.id);
                      return (
                        <div key={`a-${activity.id}`} className="group relative border-s-[3px] border-s-task">
                          <ActivityRow activity={activity} timezone={timezone} />
                          {canEdit && (
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
                                onClick={() => setDeleting(item)}
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    }
                    return (
                      <ExpenseRow
                        key={`e-${item.expense.id}`}
                        expense={item.expense}
                        className="border-s-[3px] border-s-expense"
                        onEdit={() => setEditingExpense(item.expense)}
                        onDelete={() => setDeleting(item)}
                      />
                    );
                  })}
                </Card>
              </section>
            );
          })}
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center">
          <Button variant="secondary" loading={loading} onClick={() => void load(page + 1, true)}>
            {t("common.loadMore")}
          </Button>
        </div>
      )}

      <ActivityFormModal
        open={manualOpen || editing !== null || editingExpense !== null}
        activity={editing}
        expense={editingExpense}
        enableExpense
        onClose={() => {
          setManualOpen(false);
          setEditing(null);
          setEditingExpense(null);
          void load(1, false);
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        title={deleting?.kind === "expense" ? t("expenses.deleteTitle") : t("activities.deleteTitle")}
        message={
          deleting?.kind === "expense"
            ? t("expenses.deleteMessage", { title: deleting.expense.title })
            : t("activities.deleteMessage", { title: deleting?.kind === "activity" ? deleting.activity.title : "" })
        }
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
