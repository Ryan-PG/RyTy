import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Activity, CreateActivityInput } from "@ryty/shared";
import { api, ApiError } from "../services/api";
import { useAuth } from "../stores/AuthContext";
import { useToast } from "../stores/ToastContext";
import { Button, Field, Input, Modal, Segmented, Textarea } from "./ui";
import { todayIn, utcToZonedLocalInput, zonedTimeToUtcIso } from "../utils/format";

type Mode = "range" | "duration";

interface Props {
  open: boolean;
  onClose: () => void;
  /** When provided the modal edits an existing activity. */
  activity?: Activity | null;
  initialMode?: Mode;
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
 * Manual activity entry (time range or duration-only) and the edit modal
 * for existing activities. Overlap warnings surface the backend 409 and
 * let the user save explicitly.
 */
export function ActivityFormModal({ open, onClose, activity, initialMode = "range" }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();

  const isEdit = Boolean(activity);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [start, setStart] = useState(nowLocalInput());
  const [end, setEnd] = useState(nowLocalInput());
  const [durationText, setDurationText] = useState("0:30");
  const [occurredOn, setOccurredOn] = useState(todayIn(user?.timezone ?? "UTC"));
  const [saving, setSaving] = useState(false);
  const [overlapCount, setOverlapCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setOverlapCount(null);
    if (activity) {
      setTitle(activity.title);
      setDescription(activity.description ?? "");
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
      setStart(nowLocalInput());
      setEnd(nowLocalInput());
      setDurationText("0:30");
      setOccurredOn(todayIn(user?.timezone ?? "UTC"));
      setMode(initialMode);
    }
  }, [open, activity, initialMode, user?.timezone]);

  const durationSeconds = useMemo(() => parseDurationInput(durationText), [durationText]);

  const validate = (): boolean => {
    setError(null);
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
      const shared = {
        title: title.trim(),
        description: description.trim() || null,
      };
      if (isEdit && activity) {
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
              }
            : {
                entryType: "duration",
                title: title.trim(),
                description: description.trim() || undefined,
                durationSeconds: durationSeconds!,
                occurredOn,
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

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? t("activities.editTitle") : t("dashboard.manualEntryTitle")}>
      <form onSubmit={(e) => onSubmit(e)}>
        {!isEdit && (
          <div className="mb-3">
            <Segmented<Mode>
              ariaLabel={t("dashboard.manualEntryTitle")}
              value={mode}
              onChange={(m) => {
                setMode(m);
                setOverlapCount(null);
              }}
              options={[
                { value: "range", label: t("dashboard.rangeTab") },
                { value: "duration", label: t("dashboard.durationTab") },
              ]}
            />
          </div>
        )}

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
        </div>
      </form>
    </Modal>
  );
}
