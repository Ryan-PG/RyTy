import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Trash2 } from "lucide-react";
import type { Activity, Expense } from "@ryty/shared";
import { api } from "../services/api";
import { useAuth } from "../stores/AuthContext";
import { useToast } from "../stores/ToastContext";
import { Card, ConfirmDialog, EmptyState } from "./ui";
import { ActivityRow } from "./ActivityRow";
import { ExpenseRow } from "./ExpenseRow";
import { todayIn } from "../utils/format";
import type { RecentItem } from "../utils/recent";

/**
 * The Home "Recent" timeline: the latest tasks and expenses in one list.
 * The 3px inline-start edge tells the two apart at a glance — task yellow,
 * expense blue — without extra badges or labels; rows from earlier days
 * carry their date. The owner (and any co-doer) can edit or delete a task
 * row, matching the Activities page; expenses manage their own actions.
 */
export function RecentList({
  items,
  timezone,
  onEditActivity,
  onEditExpense,
  onChanged,
}: {
  items: RecentItem[];
  timezone: string;
  /** Present when the parent can open the task form for editing. */
  onEditActivity?: (activity: Activity) => void;
  /** Present when the parent can open the expense form for editing. */
  onEditExpense?: (expense: Expense) => void;
  /** Called after any row was deleted so the parent can refresh. */
  onChanged?: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const today = todayIn(timezone);
  const [deleting, setDeleting] = useState<RecentItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

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
      onChanged?.();
    } catch {
      toast(t("common.errorGeneric"), "error");
    } finally {
      setDeleteLoading(false);
    }
  };

  if (items.length === 0) {
    return <EmptyState title={t("dashboard.nothingRecorded")} />;
  }

  return (
    <>
      <Card className="divide-y divide-border overflow-hidden">
        {items.map((item) => {
          if (item.kind === "activity") {
            const activity = item.activity;
            // The owner and any co-doer may edit or delete.
            const canManage =
              activity.userId === user?.id ||
              activity.cooperators.some((c) => c.id === user?.id);
            return (
              <div key={`a-${activity.id}`} className="group relative">
                <ActivityRow
                  activity={activity}
                  timezone={timezone}
                  showDate={activity.occurredOn !== today}
                  className="border-s-[3px] border-s-task"
                />
                {canManage && (onEditActivity || onChanged) && (
                  <div className="absolute inset-y-0 end-2 flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100">
                    {onEditActivity && (
                      <button
                        type="button"
                        aria-label={t("common.edit")}
                        className="rounded-[var(--radius-sm)] bg-surface p-1.5 text-muted shadow-sm hover:text-text"
                        onClick={() => onEditActivity(activity)}
                      >
                        <Pencil className="size-3.5" />
                      </button>
                    )}
                    {onChanged && (
                      <button
                        type="button"
                        aria-label={t("common.delete")}
                        className="rounded-[var(--radius-sm)] bg-surface p-1.5 text-muted shadow-sm hover:text-danger"
                        onClick={() => setDeleting(item)}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          }
          return (
            <ExpenseRow
              key={`e-${item.expense.id}`}
              expense={item.expense}
              showDate={item.expense.occurredOn !== today}
              className="border-s-[3px] border-s-expense"
              onEdit={onEditExpense ? () => onEditExpense(item.expense) : undefined}
              onDelete={() => setDeleting(item)}
            />
          );
        })}
      </Card>

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
    </>
  );
}
