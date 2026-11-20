import { useTranslation } from "react-i18next";
import { FolderKanban, Users } from "lucide-react";
import type { Activity } from "@ryty/shared";
import { Badge } from "./ui";
import { useAuth } from "../stores/AuthContext";
import { formatDurationCompact, formatLocalDate, formatUtcRange } from "../utils/format";
/** One compact, scannable activity row: title, meta, duration. */
export function ActivityRow({
  activity,
  timezone,
  showUser = false,
  showDate = false,
  className = "",
}: {
  activity: Activity;
  timezone: string;
  showUser?: boolean;
  /** Prefix the meta line with the activity's local day (e.g. mixed lists that span days). */
  showDate?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const { language, user } = useAuth();
  const showOwner = showUser || (activity.username !== undefined && activity.userId !== user?.id);

  return (
    <div className={`flex items-center justify-between gap-3 px-3.5 py-2.5 ${className}`}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="truncate text-sm font-medium text-text">{activity.title}</p>
          {showOwner && activity.username && (
            <span className="shrink-0 text-xs text-faint" dir="ltr">
              @{activity.username}
            </span>
          )}
          {activity.project && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
              <FolderKanban className="size-3" aria-hidden />
              <span className="max-w-32 truncate">{activity.project.name}</span>
            </span>
          )}
          {activity.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex shrink-0 items-center rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted"
            >
              #{tag}
            </span>
          ))}
          {activity.cooperators.length > 0 && (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted"
              title={t("coops.with", { names: activity.cooperators.map((c) => "@" + c.username).join(" ") })}
            >
              <Users className="size-3" aria-hidden />
              <span dir="ltr" className="max-w-40 truncate">
                {activity.cooperators.map((c) => c.username).join(", ")}
              </span>
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
          {showDate && (
            <>
              <span className="shrink-0 tabular">
                {formatLocalDate(activity.occurredOn, language, undefined, user?.dateFormat ?? "gregorian")}
              </span>
              <span aria-hidden>·</span>
            </>
          )}
          {activity.startedAt && activity.endedAt ? (
            <span dir="ltr" className="tabular">
              {formatUtcRange(activity.startedAt, activity.endedAt, timezone, language)}
            </span>
          ) : (
            <span>{t("activities.entryType.duration")}</span>
          )}
          {activity.description && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{activity.description}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge tone="neutral">{t(`activities.entryType.${activity.entryType}`)}</Badge>
        <span className="text-sm font-semibold tabular" dir="ltr">
          {formatDurationCompact(activity.durationSeconds, language)}
        </span>
      </div>
    </div>
  );
}

export function entryTypeTone(entryType: Activity["entryType"]): "accent" | "success" | "warning" {
  return entryType === "timer" ? "accent" : entryType === "range" ? "success" : "warning";
}
