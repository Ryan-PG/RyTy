import { useTranslation } from "react-i18next";
import { Pencil, Trash2 } from "lucide-react";
import type { Expense } from "@ryty/shared";
import { useAuth } from "../stores/AuthContext";
import { formatAmount, formatLocalDate } from "../utils/format";

/**
 * One compact expense row: title, meta, amount. Edit/delete are rendered
 * only for the owner (only owners may manage expenses) and only when the
 * matching callback is provided. The optional start edge colour is set by
 * the caller via `className` (e.g. `border-s-expense`).
 */
export function ExpenseRow({
  expense,
  showDate = false,
  onEdit,
  onDelete,
  className = "",
}: {
  expense: Expense;
  /** Prefix the meta line with the expense's local day (mixed lists spanning days). */
  showDate?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const { language, user } = useAuth();
  const currency = user?.currency ?? "";
  const dateFormat = user?.dateFormat ?? "gregorian";
  const isOwner = expense.userId === user?.id;

  return (
    <div className={`group relative flex items-center justify-between gap-3 px-3.5 py-2.5 ${className}`}>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-text">{expense.title}</p>
        <p className="mt-0.5 text-xs text-muted">
          {showDate && (
            <span className="tabular">
              {formatLocalDate(expense.occurredOn, language, undefined, dateFormat)}
            </span>
          )}
          {expense.description && (
            <>
              {showDate && <span aria-hidden> · </span>}
              <span className="truncate">{expense.description}</span>
            </>
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-sm font-semibold tabular" dir="ltr">
          {formatAmount(expense.amountMinor, language)} {currency}
        </span>
        {isOwner && (onEdit || onDelete) && (
          <div className="flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100">
            {onEdit && (
              <button
                type="button"
                aria-label={t("common.edit")}
                className="rounded-[var(--radius-sm)] bg-surface p-1.5 text-muted shadow-sm hover:text-text"
                onClick={onEdit}
              >
                <Pencil className="size-3.5" />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                aria-label={t("common.delete")}
                className="rounded-[var(--radius-sm)] bg-surface p-1.5 text-muted shadow-sm hover:text-danger"
                onClick={onDelete}
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
