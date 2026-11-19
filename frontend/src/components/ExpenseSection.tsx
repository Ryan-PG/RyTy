import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Trash2, Wallet } from "lucide-react";
import type { Expense } from "@ryty/shared";
import { api, ApiError } from "../services/api";
import { useAuth } from "../stores/AuthContext";
import { useToast } from "../stores/ToastContext";
import { Button, Card, ConfirmDialog, EmptyState, Field, Input, Spinner, Textarea } from "./ui";
import { formatAmount, parseAmountToMinor, todayIn } from "../utils/format";

/**
 * Expense quick entry: an inline form (title, amount, date) above the
 * recent expense list. Editing reuses the same form; deletion asks for
 * confirmation. Mirrors the calm layout of the task entry card.
 */
export function ExpenseSection() {
  const { t } = useTranslation();
  const { user, language } = useAuth();
  const { toast } = useToast();
  const timezone = user?.timezone ?? "UTC";
  const currency = user?.currency ?? "";

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [amountText, setAmountText] = useState("");
  const [date, setDate] = useState(() => todayIn(timezone));
  const [description, setDescription] = useState("");
  const [showDescription, setShowDescription] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState<Expense | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (targetPage: number, append: boolean) => {
    setLoading(true);
    try {
      const result = await api.listExpenses({ page: targetPage, pageSize: 10 });
      setExpenses((prev) => (append ? [...prev, ...result.data] : result.data));
      setTotal(result.total);
      setPage(targetPage);
    } catch {
      // the list is non-critical; the form stays usable
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(1, false);
  }, [load]);

  const resetForm = () => {
    setEditing(null);
    setTitle("");
    setAmountText("");
    setDate(todayIn(timezone));
    setDescription("");
    setShowDescription(false);
    setError(null);
  };

  const amountMinor = parseAmountToMinor(amountText);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim() || amountMinor === null) {
      setError(t("errors.validation_error"));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        amountMinor,
        occurredOn: date,
      };
      if (editing) {
        await api.updateExpense(editing.id, payload);
        toast(t("expenses.updated"));
      } else {
        await api.createExpense(payload);
        toast(t("expenses.saved"));
      }
      resetForm();
      await load(1, false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) setError(t("errors.network"));
      else setError(t("common.errorGeneric"));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await api.deleteExpense(deleting.id);
      toast(t("expenses.deleted"));
      setDeleting(null);
      await load(1, false);
    } catch {
      toast(t("common.errorGeneric"), "error");
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <form onSubmit={submit}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
            <Field label={t("expenses.whatFor")} htmlFor="exp-title">
              <Input
                id="exp-title"
                value={title}
                maxLength={200}
                placeholder={t("expenses.titlePlaceholder")}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
            <Field label={`${t("expenses.amount")} ${currency ? `(${currency})` : ""}`} htmlFor="exp-amount">
              <Input
                id="exp-amount"
                dir="ltr"
                inputMode="decimal"
                className="sm:w-36"
                value={amountText}
                placeholder="0.00"
                onChange={(e) => setAmountText(e.target.value)}
              />
            </Field>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[auto_1fr]">
            <Field label={t("dashboard.date")} htmlFor="exp-date">
              <Input
                id="exp-date"
                type="date"
                className="sm:w-40"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            <div className="flex items-end">
              {showDescription ? (
                <Textarea
                  className="w-full"
                  value={description}
                  maxLength={2000}
                  placeholder={t("dashboard.descriptionPlaceholder")}
                  onChange={(e) => setDescription(e.target.value)}
                />
              ) : (
                <button
                  type="button"
                  className="text-xs text-muted hover:text-text"
                  onClick={() => setShowDescription(true)}
                >
                  {t("dashboard.addDescription")}
                </button>
              )}
            </div>
          </div>

          {error && (
            <p role="alert" className="mt-2 text-sm text-danger">
              {error}
            </p>
          )}

          <div className="mt-3 flex gap-2">
            {editing && (
              <Button type="button" variant="secondary" onClick={resetForm}>
                {t("common.cancel")}
              </Button>
            )}
            <Button type="submit" loading={saving} disabled={!title.trim() || amountMinor === null}>
              <Wallet className="size-4" aria-hidden />
              {editing ? t("common.save") : t("expenses.add")}
            </Button>
          </div>
        </form>
      </Card>

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-muted">{t("expenses.recent")}</h2>
          <span className="text-xs text-faint tabular" dir="ltr">
            {formatAmount(
              expenses.reduce((sum, e) => sum + e.amountMinor, 0),
              language,
            )}{" "}
            {currency}
          </span>
        </div>
        {loading && expenses.length === 0 ? (
          <div className="flex justify-center py-8">
            <Spinner className="size-5 text-muted" />
          </div>
        ) : expenses.length === 0 ? (
          <EmptyState title={t("expenses.empty")} hint={t("expenses.emptyHint")} />
        ) : (
          <Card className="divide-y divide-border overflow-hidden">
            {expenses.map((expense) => (
              <div key={expense.id} className="group relative flex items-center justify-between gap-3 px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">{expense.title}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {expense.occurredOn}
                    {expense.description && (
                      <>
                        <span aria-hidden> · </span>
                        <span className="truncate">{expense.description}</span>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-sm font-semibold tabular" dir="ltr">
                    {formatAmount(expense.amountMinor, language)} {currency}
                  </span>
                  <div className="flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100">
                    <button
                      type="button"
                      aria-label={t("common.edit")}
                      className="rounded-[var(--radius-sm)] bg-surface p-1.5 text-muted shadow-sm hover:text-text"
                      onClick={() => {
                        setEditing(expense);
                        setTitle(expense.title);
                        setAmountText(String(expense.amountMinor / 100));
                        setDate(expense.occurredOn);
                        setDescription(expense.description ?? "");
                        setShowDescription(Boolean(expense.description));
                      }}
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={t("common.delete")}
                      className="rounded-[var(--radius-sm)] bg-surface p-1.5 text-muted shadow-sm hover:text-danger"
                      onClick={() => setDeleting(expense)}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </Card>
        )}
        {expenses.length < total && (
          <div className="mt-3 flex justify-center">
            <Button variant="secondary" loading={loading} onClick={() => void load(page + 1, true)}>
              {t("common.loadMore")}
            </Button>
          </div>
        )}
      </section>

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
    </div>
  );
}
