import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Project } from "@ryty/shared";
import { api } from "../services/api";
import { useAuth } from "./AuthContext";

interface ProjectsContextValue {
  projects: Project[];
  /** Projects the current user may actually attach to activities. */
  usable: Project[];
  suggested: Project[];
  loading: boolean;
  byId: (id: number | null | undefined) => Project | undefined;
  refresh: () => Promise<void>;
  create: (payload: {
    name: string;
    description?: string | null;
    visibility?: "public" | "private";
    suggest?: boolean;
  }) => Promise<Project>;
  update: (
    id: number,
    payload: { name?: string; description?: string | null; visibility?: "public" | "private" },
  ) => Promise<Project>;
  remove: (id: number) => Promise<void>;
  approve: (id: number) => Promise<Project>;
  reject: (id: number) => Promise<Project>;
  /** The current user's default project (from AuthContext preferences). */
  defaultProject: Project | undefined;
  setDefaultProject: (id: number | null) => Promise<void>;
}

const ProjectsContext = createContext<ProjectsContextValue | null>(null);

/**
 * Cached project list. Loaded once per session and refreshed after
 * mutations so pickers render instantly without refetching.
 */
export function ProjectsProvider({ children }: { children: ReactNode }) {
  const { user, updatePreferences } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setProjects(await api.listProjects());
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) void refresh();
  }, [user?.id, refresh]);

  const usable = useMemo(
    () =>
      projects.filter(
        (p) =>
          p.status === "active" &&
          (p.visibility === "public" || p.createdBy === user?.id || user?.role === "admin"),
      ),
    [projects, user?.id, user?.role],
  );

  const suggested = useMemo(() => projects.filter((p) => p.status === "suggested"), [projects]);

  const byId = useCallback(
    (id: number | null | undefined) => (id == null ? undefined : projects.find((p) => p.id === id)),
    [projects],
  );

  const create = useCallback(
    async (payload: Parameters<ProjectsContextValue["create"]>[0]) => {
      const project = await api.createProject(payload);
      setProjects((prev) => [...prev, project].sort((a, b) => a.name.localeCompare(b.name)));
      return project;
    },
    [],
  );

  const update = useCallback(
    async (id: number, payload: Parameters<ProjectsContextValue["update"]>[1]) => {
      const project = await api.updateProject(id, payload);
      setProjects((prev) => prev.map((p) => (p.id === id ? project : p)));
      return project;
    },
    [],
  );

  const remove = useCallback(async (id: number) => {
    await api.deleteProject(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const approve = useCallback(async (id: number) => {
    const project = await api.approveProject(id);
    setProjects((prev) => prev.map((p) => (p.id === id ? project : p)));
    return project;
  }, []);

  const reject = useCallback(async (id: number) => {
    const project = await api.rejectProject(id);
    setProjects((prev) => prev.map((p) => (p.id === id ? project : p)));
    return project;
  }, []);

  const defaultProject = useMemo(
    () => (user?.defaultProjectId ? byId(user.defaultProjectId) : undefined),
    [user?.defaultProjectId, byId],
  );

  const setDefaultProject = useCallback(
    async (id: number | null) => {
      // Optimistic: update the local user immediately, revert on failure.
      await updatePreferences({ defaultProjectId: id });
    },
    [updatePreferences],
  );

  const value = useMemo(
    () => ({
      projects,
      usable,
      suggested,
      loading,
      byId,
      refresh,
      create,
      update,
      remove,
      approve,
      reject,
      defaultProject,
      setDefaultProject,
    }),
    [projects, usable, suggested, loading, byId, refresh, create, update, remove, approve, reject, defaultProject, setDefaultProject],
  );

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
}

export function useProjects(): ProjectsContextValue {
  const ctx = useContext(ProjectsContext);
  if (!ctx) throw new Error("useProjects must be used within ProjectsProvider");
  return ctx;
}
