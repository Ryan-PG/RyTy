import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, FolderKanban, Plus, Star } from "lucide-react";
import { useProjects } from "../stores/ProjectsContext";
import { useAuth } from "../stores/AuthContext";
import { Badge, Button, Field, Input, Modal, Textarea } from "./ui";

interface ProjectPickerProps {
  /** Selected project id (null = no project). */
  value: number | null;
  onChange: (projectId: number | null) => void;
  ariaLabel?: string;
}

/**
 * Inline project selector: opens a popover listing accessible projects with
 * a star action to set the user's default project and a quick "new project"
 * flow (private, or suggested to the admin for public review).
 */
export function ProjectPicker({ value, onChange, ariaLabel }: ProjectPickerProps) {
  const { t } = useTranslation();
  const { usable, defaultProject, setDefaultProject, create } = useProjects();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const selected = value ? usable.find((p) => p.id === value) : undefined;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 text-xs font-medium text-muted hover:text-text"
      >
        <FolderKanban className="size-3.5" aria-hidden />
        <span className="max-w-40 truncate">{selected ? selected.name : t("projects.noProject")}</span>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-72 rounded-[var(--radius-lg)] border border-border bg-surface p-1.5 shadow-lg">
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-[var(--radius)] px-2.5 py-2 text-start text-sm text-muted hover:bg-surface-2"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          >
            <FolderKanban className="size-4 shrink-0 opacity-50" aria-hidden />
            <span className="flex-1">{t("projects.noProject")}</span>
            {value === null && <Check className="size-4 text-accent" aria-hidden />}
          </button>
          <div className="my-1 border-t border-border" />
          <div className="max-h-56 overflow-y-auto">
            {usable.map((project) => (
              <div key={project.id} className="flex items-center gap-1">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-[var(--radius)] px-2.5 py-2 text-start text-sm hover:bg-surface-2"
                  onClick={() => {
                    onChange(project.id);
                    setOpen(false);
                  }}
                >
                  <FolderKanban className="size-4 shrink-0 text-accent" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{project.name}</span>
                  {defaultProject?.id === project.id && (
                    <Badge tone="accent">{t("projects.defaultBadge")}</Badge>
                  )}
                  {value === project.id && <Check className="size-4 shrink-0 text-accent" aria-hidden />}
                </button>
                <button
                  type="button"
                  title={t("projects.setDefault")}
                  aria-label={t("projects.setDefault")}
                  className="shrink-0 rounded-[var(--radius-sm)] p-1.5 text-faint hover:bg-surface-2 hover:text-warning"
                  onClick={() => void setDefaultProject(project.id)}
                >
                  <Star
                    className="size-3.5"
                    aria-hidden
                    fill={defaultProject?.id === project.id ? "currentColor" : "none"}
                  />
                </button>
              </div>
            ))}
            {usable.length === 0 && (
              <p className="px-2.5 py-2 text-sm text-muted">{t("projects.empty")}</p>
            )}
          </div>
          <div className="my-1 border-t border-border" />
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-[var(--radius)] px-2.5 py-2 text-start text-sm font-medium text-accent hover:bg-accent-soft"
            onClick={() => {
              setCreateOpen(true);
              setOpen(false);
            }}
          >
            <Plus className="size-4" aria-hidden />
            {t("projects.new")}
          </button>
        </div>
      )}

      <CreateProjectModal
        open={createOpen}
        isAdmin={user?.role === "admin"}
        onClose={() => setCreateOpen(false)}
        onCreated={(project) => {
          // Select the freshly created project right away.
          onChange(project.id);
        }}
        createProject={create}
      />
    </div>
  );
}

interface CreateProjectModalProps {
  open: boolean;
  isAdmin: boolean;
  onClose: () => void;
  onCreated: (project: { id: number; name: string }) => void;
  createProject: ProjectsContextCreate;
}

type ProjectsContextCreate = (payload: {
  name: string;
  description?: string | null;
  visibility?: "public" | "private";
  suggest?: boolean;
}) => Promise<{ id: number; name: string }>;

/** Quick project creation from the picker: private, public (admin), or suggested. */
export function CreateProjectModal({ open, isAdmin, onClose, onCreated, createProject }: CreateProjectModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<"public" | "private" | "suggest">(
    isAdmin ? "public" : "private",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setMode(isAdmin ? "public" : "private");
      setError(null);
    }
  }, [open, isAdmin]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // The modal is opened from inside another dialog's form; keep the submit
    // from bubbling through the React tree into that outer form.
    e.stopPropagation();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const project = await createProject({
        name: name.trim(),
        description: description.trim() || null,
        ...(isAdmin
          ? { visibility: mode === "public" ? ("public" as const) : ("private" as const) }
          : mode === "suggest"
            ? { suggest: true }
            : {}),
      });
      onCreated(project);
      onClose();
    } catch (err: any) {
      setError(
        err?.code === "project_name_taken" ? t("projects.nameTaken") : t("common.errorGeneric"),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t("projects.createTitle")}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label={t("projects.name")} htmlFor="np-name">
          <Input
            id="np-name"
            required
            maxLength={80}
            value={name}
            placeholder={t("projects.namePlaceholder")}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label={`${t("projects.description")} — ${t("common.optional")}`} htmlFor="np-desc">
          <Textarea
            id="np-desc"
            maxLength={500}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Field label={t("projects.visibilityLabel")}>
          {isAdmin ? (
            <div className="flex gap-2">
              <Button
                type="button"
                variant={mode === "public" ? "primary" : "secondary"}
                onClick={() => setMode("public")}
              >
                {t("projects.visibilityPublic")}
              </Button>
              <Button
                type="button"
                variant={mode === "private" ? "primary" : "secondary"}
                onClick={() => setMode("private")}
              >
                {t("projects.visibilityPrivate")}
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                type="button"
                variant={mode === "private" ? "primary" : "secondary"}
                onClick={() => setMode("private")}
              >
                {t("projects.visibilityPrivate")}
              </Button>
              <Button
                type="button"
                variant={mode === "suggest" ? "primary" : "secondary"}
                onClick={() => setMode("suggest")}
              >
                {t("projects.suggestToAdmin")}
              </Button>
            </div>
          )}
          <p className="text-xs text-muted">
            {isAdmin
              ? mode === "public"
                ? t("projects.publicHint")
                : t("projects.privateHint")
              : mode === "suggest"
                ? t("projects.suggestHint")
                : t("projects.privateHint")}
          </p>
        </Field>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" loading={saving}>
            {t("common.create")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
