import type {
  Activity,
  ActiveTimer,
  AppSettings,
  AuthUser,
  CreateActivityInput,
  Expense,
  Paginated,
  Project,
  ReportSummary,
  SetupStatus,
  Tag,
  UpdateActivityInput,
  UpdateExpenseInput,
  User,
  ActivityListQuery,
} from "@ryty/shared";

/** API error with backend error-envelope semantics. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError(0, "network", "Network error");
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // non-JSON body (e.g. empty)
  }
  if (!response.ok) {
    const err = (body as { error?: { code?: string; message?: string; details?: Record<string, unknown> } })?.error;
    throw new ApiError(
      response.status,
      err?.code ?? "unknown_error",
      err?.message ?? "Request failed",
      err?.details,
    );
  }
  return (body as { data: T }).data;
}

function jsonBody(payload: unknown): RequestInit {
  return { method: "POST", body: JSON.stringify(payload) };
}

export interface AppInfo extends SetupStatus {
  appName: string;
  defaultLanguage: string;
}

export const api = {
  /* ------------------------------ public ----------------------------- */
  async setupStatus(): Promise<SetupStatus & AppInfo> {
    return request<SetupStatus & AppInfo>("/api/setup/status");
  },

  /* ------------------------------- auth ------------------------------ */
  login: (username: string, password: string) =>
    request<AuthUser>("/api/auth/login", jsonBody({ username, password })),

  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),

  me: () => request<AuthUser>("/api/auth/me"),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<AuthUser>("/api/auth/change-password", jsonBody({ currentPassword, newPassword })),

  updatePreferences: (payload: {
    language?: string;
    theme?: string;
    timezone?: string;
    defaultProjectId?: number | null;
  }) =>
    request<AuthUser>("/api/auth/preferences", { method: "PATCH", body: JSON.stringify(payload) }),

  /* ----------------------------- projects ---------------------------- */
  listProjects: () => request<Project[]>("/api/projects"),

  createProject: (payload: {
    name: string;
    description?: string | null;
    visibility?: "public" | "private";
    suggest?: boolean;
  }) => request<Project>("/api/projects", jsonBody(payload)),

  updateProject: (
    id: number,
    payload: { name?: string; description?: string | null; visibility?: "public" | "private" },
  ) => request<Project>(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),

  deleteProject: (id: number) =>
    request<{ ok: boolean }>(`/api/projects/${id}`, { method: "DELETE" }),

  approveProject: (id: number) =>
    request<Project>(`/api/projects/${id}/approve`, { method: "POST", body: "{}" }),

  rejectProject: (id: number) =>
    request<Project>(`/api/projects/${id}/reject`, { method: "POST", body: "{}" }),

  /* ------------------------------- tags ------------------------------ */
  listTags: (q?: string) => request<Tag[]>(`/api/tags${q ? `?q=${encodeURIComponent(q)}` : ""}`),

  createTag: (name: string) => request<Tag>("/api/tags", jsonBody({ name })),

  /* ---------------------------- activities --------------------------- */
  listActivities: (query: Partial<ActivityListQuery> & { page?: number; pageSize?: number }) => {
    const params = new URLSearchParams();
    if (query.page) params.set("page", String(query.page));
    if (query.pageSize) params.set("pageSize", String(query.pageSize));
    if (query.q) params.set("q", query.q);
    if (query.from) params.set("from", query.from);
    if (query.to) params.set("to", query.to);
    if (query.projectId) params.set("projectId", String(query.projectId));
    if (query.tag) params.set("tag", query.tag);
    if (query.userId) params.set("userId", String(query.userId));
    const qs = params.toString();
    return request<Paginated<Activity>>(`/api/activities${qs ? `?${qs}` : ""}`);
  },

  createActivity: (payload: CreateActivityInput) =>
    request<Activity>("/api/activities", jsonBody(payload)),

  updateActivity: (id: number, payload: UpdateActivityInput) =>
    request<Activity>(`/api/activities/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),

  deleteActivity: (id: number) =>
    request<{ ok: boolean }>(`/api/activities/${id}`, { method: "DELETE" }),

  /* ------------------------------ expenses --------------------------- */
  listExpenses: (query: { page?: number; pageSize?: number; q?: string; from?: string; to?: string } = {}) => {
    const params = new URLSearchParams();
    if (query.page) params.set("page", String(query.page));
    if (query.pageSize) params.set("pageSize", String(query.pageSize));
    if (query.q) params.set("q", query.q);
    if (query.from) params.set("from", query.from);
    if (query.to) params.set("to", query.to);
    const qs = params.toString();
    return request<Paginated<Expense>>(`/api/expenses${qs ? `?${qs}` : ""}`);
  },

  createExpense: (payload: { title: string; description?: string | null; amountMinor: number; occurredOn?: string }) =>
    request<Expense>("/api/expenses", jsonBody(payload)),

  updateExpense: (id: number, payload: UpdateExpenseInput) =>
    request<Expense>(`/api/expenses/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),

  deleteExpense: (id: number) =>
    request<{ ok: boolean }>(`/api/expenses/${id}`, { method: "DELETE" }),

  /* ------------------------------- timer ----------------------------- */
  startTimer: (
    title: string,
    description?: string,
    projectId?: number | null,
    tags?: string[],
    cooperatorIds?: number[],
  ) =>
    request<ActiveTimer & { elapsedSeconds: number }>(
      "/api/timer/start",
      jsonBody({
        title,
        description,
        projectId: projectId ?? null,
        tags,
        cooperatorIds,
      }),
    ),

  pauseTimer: () =>
    request<ActiveTimer & { elapsedSeconds: number }>("/api/timer/pause", { method: "POST", body: "{}" }),

  resumeTimer: () =>
    request<ActiveTimer & { elapsedSeconds: number }>("/api/timer/resume", { method: "POST", body: "{}" }),

  stopTimer: (overrides?: { title?: string; description?: string | null }) =>
    request<Activity>("/api/timer/stop", { method: "POST", body: JSON.stringify(overrides ?? {}) }),

  cancelTimer: () => request<{ ok: boolean }>("/api/timer/cancel", { method: "POST", body: "{}" }),

  activeTimer: () =>
    request<(ActiveTimer & { elapsedSeconds: number }) | null>("/api/timer/active"),

  /* ------------------------------ reports ---------------------------- */
  reportSummary: (query: { from: string; to: string; userId?: number }) => {
    const params = new URLSearchParams({ from: query.from, to: query.to });
    if (query.userId) params.set("userId", String(query.userId));
    return request<ReportSummary>(`/api/reports/summary?${params}`);
  },

  exportCsvUrl: (query: { from: string; to: string; userId?: number }) => {
    const params = new URLSearchParams({ from: query.from, to: query.to });
    if (query.userId) params.set("userId", String(query.userId));
    return `/api/reports/export?${params}`;
  },

  listUsersForFilter: () =>
    request<{ id: number; username: string }[]>("/api/users"),

  /* ------------------------------- admin ----------------------------- */
  admin: {
    listUsers: () => request<User[]>("/api/admin/users"),

    createUser: (payload: { username: string; password: string; role: "admin" | "user" }) =>
      request<User>("/api/admin/users", jsonBody(payload)),

    updateUser: (id: number, payload: { username?: string; role?: "admin" | "user"; isActive?: boolean }) =>
      request<User>(`/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),

    resetPassword: (id: number, password?: string) =>
      request<{ temporaryPassword?: string; mustChangePassword: boolean }>(
        `/api/admin/users/${id}/reset-password`,
        jsonBody(password ? { password } : {}),
      ),

    getSettings: () => request<AppSettings>("/api/admin/settings"),

    updateSettings: (payload: Partial<AppSettings>) =>
      request<AppSettings>("/api/admin/settings", { method: "PATCH", body: JSON.stringify(payload) }),
  },
};
