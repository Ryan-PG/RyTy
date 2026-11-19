import { useTranslation } from "react-i18next";
import { FolderKanban } from "lucide-react";
import type { Activity } from "@ryty/shared";
import { Badge } from "./ui";
import { useAuth } from "../stores/AuthContext";
import { formatDurationCompact, formatUtcRange } from "../utils/format";
/** One compact, scannable activity row: title, meta, duration. */
export function ActivityRow({
  activity,
  timezone,
  showUser = false,
}: {
  activity: Activity;
  timezone: string;
  showUser?: boolean;
}) {
  const { t } = useTranslation();
  const { language } = useAuth();

  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="truncate text-sm font-medium text-text">{activity.title}</p>
          {showUser && activity.username && (
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
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
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
