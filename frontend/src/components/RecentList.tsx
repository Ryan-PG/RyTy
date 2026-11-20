import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Trash2 } from "lucide-react";
import type { Expense } from "@ryty/shared";
import { api } from "../services/api";
import { useAuth } from "../stores/AuthContext";
import { useToast } from "../stores/ToastContext";
import { Card, ConfirmDialog, EmptyState } from "./ui";
import { ActivityRow } from "./ActivityRow";
import { formatAmount, formatLocalDate } from "../utils/format";
import type { RecentItem } from "../utils/recent";

export function RecentList({
  items,
  timezone,
  showDates = false,
  onEditExpense,
  onChanged,
}: {
  items: RecentItem[];
  timezone: string;
  /** Show each row's local day (set when the list falls back to past days). */
  showDates?: boolean;
  /** Present when the parent can open the expense form for editing. */
  onEditExpense?: (expense: Expense) => void;
  /** Called after an expense row was deleted so the parent can refresh. */
  onChanged?: () => void;
}) {
  const { t } = useTranslation();
  const { language, user } = useAuth();
  const { toast } = useToast();
  const currency = user?.currency ?? "";
  const dateFormat = user?.dateFormat ?? "gregorian";
  const [deleting, setDeleting] = useState<Expense | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const onDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await api.deleteExpense(deleting.id);
      toast(t("expenses.deleted"));
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
        {items.map((item) =>
          item.kind === "activity" ? (
            <ActivityRow
              key={`a-${item.activity.id}`}
              activity={item.activity}
              timezone={timezone}
              showDate={showDates}
              className="border-s-[3px] border-s-task"
            />
          ) : (
            <div
              key={`e-${item.expense.id}`}
              className="group relative flex items-center justify-between gap-3 border-s-[3px] border-s-expense px-3.5 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text">{item.expense.title}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {showDates && (
                    <span className="tabular">
                      {formatLocalDate(item.expense.occurredOn, language, undefined, dateFormat)}
                    </span>
                  )}
                  {item.expense.description && (
                    <>
                      {showDates && <span aria-hidden> · </span>}
                      <span className="truncate">{item.expense.description}</span>
                    </>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-sm font-semibold tabular" dir="ltr">
                  {formatAmount(item.expense.amountMinor, language)} {currency}
                </span>
                {item.expense.userId === user?.id && (
                  <div className="flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100">
                    {onEditExpense && (
                      <button
                        type="button"
                        aria-label={t("common.edit")}
                        className="rounded-[var(--radius-sm)] bg-surface p-1.5 text-muted shadow-sm hover:text-text"
                        onClick={() => onEditExpense(item.expense)}
                      >
                        <Pencil className="size-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={t("common.delete")}
                      className="rounded-[var(--radius-sm)] bg-surface p-1.5 text-muted shadow-sm hover:text-danger"
                      onClick={() => setDeleting(item.expense)}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ),
        )}
      </Card>

      <ConfirmDialog
        open={deleting !== null}
        title={t("expenses.deleteTitle")}
        message={t("expenses.deleteMessage", { title: deleting?.title ?? "" })}
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
