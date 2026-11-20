import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Wallet } from "lucide-react";
import type { Expense } from "@ryty/shared";
import { api, ApiError } from "../services/api";
import { useAuth } from "../stores/AuthContext";
import { useToast } from "../stores/ToastContext";
import { Button, Card, Field, Input, Textarea } from "./ui";
import { formatAmountInput, parseAmountToMinor, todayIn } from "../utils/format";

/**
 * Expense quick entry: an inline form (title, amount, date). Mirrors the
 * calm layout of the task entry card. The recent expense list lives in the
 * dashboard's shared "Recent" timeline, so creating/updating here only
 * signals the parent to refresh that list.
 */
export function ExpenseSection({
  editRequest,
  onEditConsumed,
  onChanged,
}: {
  /** An expense to load into the form (e.g. the Recent list's edit pencil). */
  editRequest: Expense | null;
  onEditConsumed: () => void;
  /** Fired after a create/update so the parent can refresh the Recent list. */
  onChanged?: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const timezone = user?.timezone ?? "UTC";
  const currency = user?.currency ?? "";

  const [title, setTitle] = useState("");
  const [amountText, setAmountText] = useState("");
  const [date, setDate] = useState(() => todayIn(timezone));
  const [description, setDescription] = useState("");
  const [showDescription, setShowDescription] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Adopt an edit request coming from the Recent list (one-shot per request).
  useEffect(() => {
    if (!editRequest) return;
    setEditing(editRequest);
    setTitle(editRequest.title);
    setAmountText(formatAmountInput(String(editRequest.amountMinor / 100)));
    setDate(editRequest.occurredOn);
    setDescription(editRequest.description ?? "");
    setShowDescription(Boolean(editRequest.description));
    setError(null);
    onEditConsumed();
  }, [editRequest, onEditConsumed]);

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
      onChanged?.();
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) setError(t("errors.network"));
      else setError(t("common.errorGeneric"));
    } finally {
      setSaving(false);
    }
  };

  return (
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
              onChange={(e) => setAmountText(formatAmountInput(e.target.value))}
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
  );
}
