import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Expense } from "@ryty/shared";
import { api } from "../services/api";
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
 * carry their date.
 */
export function RecentList({
  items,
  timezone,
  onEditExpense,
  onChanged,
}: {
  items: RecentItem[];
  timezone: string;
  /** Present when the parent can open the expense form for editing. */
  onEditExpense?: (expense: Expense) => void;
  /** Called after an expense row was deleted so the parent can refresh. */
  onChanged?: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const today = todayIn(timezone);
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
              showDate={item.activity.occurredOn !== today}
              className="border-s-[3px] border-s-task"
            />
          ) : (
            <ExpenseRow
              key={`e-${item.expense.id}`}
              expense={item.expense}
              showDate={item.expense.occurredOn !== today}
              className="border-s-[3px] border-s-expense"
              onEdit={onEditExpense ? () => onEditExpense(item.expense) : undefined}
              onDelete={() => setDeleting(item.expense)}
            />
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
