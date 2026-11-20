import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Activity, CreateActivityInput, Expense } from "@ryty/shared";
import { api, ApiError } from "../services/api";
import { useAuth } from "../stores/AuthContext";
import { useProjects } from "../stores/ProjectsContext";
import { useToast } from "../stores/ToastContext";
import { Button, Field, Input, Modal, Segmented, Textarea } from "./ui";
import { ProjectPicker } from "./ProjectPicker";
import { TagInput } from "./TagInput";
import { CoopPicker } from "./CoopPicker";
import { formatAmountInput, parseAmountToMinor, todayIn, utcToZonedLocalInput, zonedTimeToUtcIso } from "../utils/format";

type Mode = "range" | "duration";
type Kind = "task" | "expense";

interface Props {
  open: boolean;
  onClose: () => void;
  /** When provided the modal edits an existing activity. */
  activity?: Activity | null;
  /** When provided the modal edits an existing expense. */
  expense?: Expense | null;
  initialMode?: Mode;
  /** Show the Task/Expense switch (add flows that also accept expenses). */
  enableExpense?: boolean;
}

function nowLocalInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseDurationInput(value: string): number | null {
  const m = /^\s*(\d{1,3})\s*[:.]\s*(\d{1,2})\s*$/.exec(value);
  if (m) {
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (min > 59) return null;
    const seconds = h * 3600 + min * 60;
    return seconds >= 1 ? seconds : null;
  }
  const plain = Number(value);
  if (Number.isInteger(plain) && plain >= 1 && plain <= 24 * 60) {
    return plain * 60; // minutes
  }
  return null;
}

/**
 * Manual entry dialog. Tasks: time range or duration-only activity (also
 * the edit modal for existing activities). With `enableExpense` the dialog
 * gains an Expense tab (and with `expense` it edits an expense in place).
 * Overlap warnings surface the backend 409 and let the user save explicitly.
 */
export function ActivityFormModal({ open, onClose, activity, expense, initialMode = "range", enableExpense = false }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { defaultProject } = useProjects();
  const { toast } = useToast();
  const currency = user?.currency ?? "";

  const editingActivity = Boolean(activity);
  const editingExpense = Boolean(expense);
  const [kind, setKind] = useState<Kind>("task");
  const [mode, setMode] = useState<Mode>(initialMode);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amountText, setAmountText] = useState("");
  const [start, setStart] = useState(nowLocalInput());
  const [end, setEnd] = useState(nowLocalInput());
  const [durationText, setDurationText] = useState("0:30");
  const [occurredOn, setOccurredOn] = useState(todayIn(user?.timezone ?? "UTC"));
  const [projectId, setProjectId] = useState<number | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [cooperatorIds, setCooperatorIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [overlapCount, setOverlapCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setOverlapCount(null);
    if (expense) {
      setKind("expense");
      setTitle(expense.title);
      setDescription(expense.description ?? "");
      setAmountText(formatAmountInput(String(expense.amountMinor / 100)));
      setOccurredOn(expense.occurredOn);
      return;
    }
    setKind("task");
    if (activity) {
      setTitle(activity.title);
      setDescription(activity.description ?? "");
      setProjectId(activity.project?.id ?? null);
      setTags(activity.tags);
      setCooperatorIds(activity.cooperators.map((c) => c.id));
      const timezone = user?.timezone ?? "UTC";
      if (activity.entryType === "duration") {
        setMode("duration");
        const h = Math.floor(activity.durationSeconds / 3600);
        const m = Math.floor((activity.durationSeconds % 3600) / 60);
        setDurationText(`${h}:${String(m).padStart(2, "0")}`);
        setOccurredOn(activity.occurredOn);
      } else {
        setMode("range");
        setStart(utcToZonedLocalInput(activity.startedAt ?? "", timezone));
        setEnd(utcToZonedLocalInput(activity.endedAt ?? "", timezone));
      }
    } else {
      setTitle("");
      setDescription("");
      setAmountText("");
      setStart(nowLocalInput());
      setEnd(nowLocalInput());
      setDurationText("0:30");
      setOccurredOn(todayIn(user?.timezone ?? "UTC"));
      setMode(initialMode);
      // Default to the user's default project for frictionless entry.
      setProjectId(defaultProject?.id ?? null);
      setTags([]);
      setCooperatorIds([]);
    }
  }, [open, activity, expense, initialMode, user?.timezone, defaultProject?.id]);

  const durationSeconds = useMemo(() => parseDurationInput(durationText), [durationText]);
  const amountMinor = useMemo(() => parseAmountToMinor(amountText), [amountText]);

  const validate = (): boolean => {
    setError(null);
    if (kind === "expense") {
      if (!title.trim() || amountMinor === null) {
        setError(t("errors.validation_error"));
        return false;
      }
      return true;
    }
    if (!title.trim()) {
      setError(t("errors.validation_error"));
      return false;
    }
    if (mode === "range") {
      if (zonedTimeToUtcIso(start, user?.timezone ?? "UTC") === null || zonedTimeToUtcIso(end, user?.timezone ?? "UTC") === null) {
        setError(t("errors.validation_error"));
        return false;
      }
      if (start >= end) {
        setError(t("errors.invalid_range"));
        return false;
      }
    } else if (durationSeconds === null) {
      setError(t("errors.validation_error"));
      return false;
    }
    return true;
  };

  const onSubmit = async (e: React.FormEvent, allowOverlap = false) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    setError(null);
    try {
      if (kind === "expense") {
        const payload = {
          title: title.trim(),
          description: description.trim() || null,
          amountMinor: amountMinor!,
          occurredOn,
        };
        if (expense) {
          await api.updateExpense(expense.id, payload);
          toast(t("expenses.updated"));
        } else {
          await api.createExpense(payload);
          toast(t("expenses.saved"));
        }
        onClose();
        return;
      }
      const shared = {
        title: title.trim(),
        description: description.trim() || null,
        projectId,
        tags,
        cooperatorIds,
      };
      if (editingActivity && activity) {
        await api.updateActivity(
          activity.id,
          mode === "range"
            ? { ...shared, start, end, allowOverlap }
            : { ...shared, durationSeconds: durationSeconds!, occurredOn, allowOverlap },
        );
        toast(t("dashboard.updated"));
      } else {
        const payload: CreateActivityInput =
          mode === "range"
            ? {
                entryType: "range",
                title: title.trim(),
                description: description.trim() || undefined,
                start,
                end,
                allowOverlap,
                projectId,
                tags,
              }
            : {
                entryType: "duration",
                title: title.trim(),
                description: description.trim() || undefined,
                durationSeconds: durationSeconds!,
                occurredOn,
                projectId,
                tags,
              };
        await api.createActivity(payload);
        toast(t("dashboard.saved"));
      }
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === "activity_overlap") {
        const overlapping = (err.details?.overlapping as unknown[] | undefined)?.length ?? 1;
        setOverlapCount(overlapping);
      } else if (err instanceof ApiError && err.code === "invalid_range") {
        setError(t("errors.invalid_range"));
      } else if (err instanceof ApiError && err.status === 0) {
        setError(t("errors.network"));
      } else {
        setError(t("common.errorGeneric"));
      }
    } finally {
      setSaving(false);
    }
  };

  const modalTitle = editingExpense
    ? t("expenses.editTitle")
    : kind === "expense"
      ? t("expenses.addTitle")
      : editingActivity
        ? t("activities.editTitle")
        : t("dashboard.manualEntryTitle");

  return (
    <Modal open={open} onClose={onClose} title={modalTitle}>
      <form onSubmit={(e) => onSubmit(e)}>
        {!editingActivity && !editingExpense && enableExpense && (
          <div className="mb-3">
            <Segmented<Kind>
              ariaLabel={t("dashboard.entryTabs")}
              value={kind}
              onChange={(k) => {
                setKind(k);
                setOverlapCount(null);
              }}
              options={[
                { value: "task", label: t("dashboard.taskTab") },
                { value: "expense", label: t("dashboard.expenseTab") },
              ]}
            />
          </div>
        )}

        {kind === "expense" ? (
          <div className="flex flex-col gap-3">
            <Field label={t("expenses.whatFor")} htmlFor="af-title">
              <Input
                id="af-title"
                value={title}
                required
                maxLength={200}
                placeholder={t("expenses.titlePlaceholder")}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={`${t("expenses.amount")} ${currency ? `(${currency})` : ""}`} htmlFor="af-amount">
                <Input
                  id="af-amount"
                  dir="ltr"
                  inputMode="decimal"
                  value={amountText}
                  placeholder="0.00"
                  onChange={(e) => setAmountText(formatAmountInput(e.target.value))}
                />
              </Field>
              <Field label={t("dashboard.date")} htmlFor="af-expense-date">
                <Input
                  id="af-expense-date"
                  type="date"
                  value={occurredOn}
                  onChange={(e) => setOccurredOn(e.target.value)}
                />
              </Field>
            </div>
            <Field label={`${t("expenses.description")} — ${t("common.optional")}`} htmlFor="af-expense-desc">
              <Textarea
                id="af-expense-desc"
                value={description}
                maxLength={2000}
                placeholder={t("dashboard.descriptionPlaceholder")}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Field label={t("dashboard.whatAreYouWorkingOn")} htmlFor="af-title">
              <Input
                id="af-title"
                value={title}
                required
                maxLength={200}
                placeholder={t("dashboard.activityTitlePlaceholder")}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
            <Field label={`${t("nav.activities")} — ${t("common.optional")}`} htmlFor="af-desc">
              <Textarea
                id="af-desc"
                value={description}
                maxLength={2000}
                placeholder={t("dashboard.descriptionPlaceholder")}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={t("projects.title")}>
                <ProjectPicker
                  value={projectId}
                  onChange={setProjectId}
                  ariaLabel={t("projects.title")}
                />
              </Field>
              <Field label={t("tags.title")} hint={t("tags.hint")}>
                <TagInput
                  value={tags}
                  onChange={setTags}
                  placeholder={t("tags.placeholder")}
                  ariaLabel={t("tags.title")}
                />
              </Field>
            </div>

            <Field label={t("coops.title")} hint={t("coops.hint")}>
              <CoopPicker
                value={cooperatorIds}
                onChange={setCooperatorIds}
                ownerId={user?.id}
                placeholder={t("coops.placeholder")}
                ariaLabel={t("coops.title")}
              />
            </Field>

            {mode === "range" ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("dashboard.startTime")} htmlFor="af-start">
                  <Input
                    id="af-start"
                    type="datetime-local"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </Field>
                <Field label={t("dashboard.endTime")} htmlFor="af-end">
                  <Input
                    id="af-end"
                    type="datetime-local"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </Field>
              </div>
            ) : (
              <>
                <Field label={t("dashboard.duration")} hint={t("dashboard.durationHint")} htmlFor="af-duration">
                  <Input
                    id="af-duration"
                    dir="ltr"
                    inputMode="numeric"
                    value={durationText}
                    onChange={(e) => setDurationText(e.target.value)}
                  />
                </Field>
                <Field label={t("dashboard.date")} htmlFor="af-date">
                  <Input
                    id="af-date"
                    type="date"
                    value={occurredOn}
                    onChange={(e) => setOccurredOn(e.target.value)}
                  />
                </Field>
              </>
            )}
          </div>
        )}

        {overlapCount !== null && (
          <div className="rounded-[var(--radius)] bg-warning-soft p-2.5 text-sm text-warning" role="alert">
            {t("dashboard.overlapWarning", { count: overlapCount })}
            <Button
              type="button"
              variant="secondary"
              className="mt-2 w-full"
              loading={saving}
              onClick={(e) => {
                void onSubmit(e as unknown as React.FormEvent, true);
              }}
            >
              {t("common.saveAnyway")}
            </Button>
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" loading={saving}>
            {t("common.save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
