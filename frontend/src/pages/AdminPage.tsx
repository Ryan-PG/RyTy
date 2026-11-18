import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyRound, Pencil, UserPlus } from "lucide-react";
import type { AppSettings, User } from "@ryty/shared";
import { COMMON_TIMEZONES, LANGUAGES } from "@ryty/shared";
import { api, ApiError } from "../services/api";
import { useAuth } from "../stores/AuthContext";
import { useToast } from "../stores/ToastContext";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Field,
  Input,
  Modal,
  Segmented,
  Select,
  Spinner,
} from "../components/ui";
import { formatLocalDate } from "../utils/format";

/** Administration: user management and application settings. */
export function AdminPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"users" | "settings">("users");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">{t("admin.title")}</h1>
        <Segmented<"users" | "settings">
          ariaLabel={t("admin.title")}
          value={tab}
          onChange={setTab}
          options={[
            { value: "users", label: t("admin.usersTab") },
            { value: "settings", label: t("admin.settingsTab") },
          ]}
        />
      </div>
      {tab === "users" ? <UsersTab /> : <SettingsTab />}
    </div>
  );
}

/* ------------------------------ Users ------------------------------- */

function UsersTab() {
  const { t } = useTranslation();
  const { user: me } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [resetting, setResetting] = useState<User | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetResult, setResetResult] = useState<{ username: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await api.admin.listUsers());
    } catch {
      toast(t("common.errorGeneric"), "error");
    } finally {
      setLoading(false);
    }
  }, [t, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () => users.filter((u) => u.username.toLowerCase().includes(filter.trim().toLowerCase())),
    [users, filter],
  );

  const showGeneratedPassword = (username: string, password: string) => {
    setResetting(null);
    setResetResult({ username, password });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Input
          type="search"
          className="flex-1"
          placeholder={t("admin.users.filterPlaceholder")}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <Button onClick={() => setCreateOpen(true)}>
          <UserPlus className="size-4" aria-hidden />
          {t("common.create")}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner className="size-5 text-muted" />
        </div>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-faint">
                <th className="px-3.5 py-2 text-start font-medium">{t("admin.users.username")}</th>
                <th className="px-3.5 py-2 text-start font-medium">{t("admin.users.role")}</th>
                <th className="hidden px-3.5 py-2 text-start font-medium sm:table-cell">{t("admin.users.created")}</th>
                <th className="px-3.5 py-2 text-start font-medium">{t("admin.users.status")}</th>
                <th className="px-3.5 py-2 text-end font-medium">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0">
                  <td className="px-3.5 py-2.5 font-medium" dir="ltr">
                    {u.username}
                    {me?.id === u.id && <span className="ms-1 text-xs text-faint">({t("account.title")})</span>}
                  </td>
                  <td className="px-3.5 py-2.5">
                    <Badge tone={u.role === "admin" ? "accent" : "neutral"}>
                      {u.role === "admin" ? t("admin.users.admin") : t("admin.users.user")}
                    </Badge>
                  </td>
                  <td className="hidden px-3.5 py-2.5 text-muted sm:table-cell">
                    {formatLocalDate(u.createdAt.slice(0, 10), "en", {})}
                  </td>
                  <td className="px-3.5 py-2.5">
                    <Badge tone={u.isActive ? "success" : "danger"}>
                      {u.isActive ? t("admin.users.active") : t("admin.users.disabled")}
                    </Badge>
                  </td>
                  <td className="px-3.5 py-2.5">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        aria-label={t("common.edit")}
                        className="rounded-[var(--radius-sm)] p-1.5 text-muted hover:bg-surface-2 hover:text-text"
                        onClick={() => setEditing(u)}
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={t("admin.users.resetPassword")}
                        className="rounded-[var(--radius-sm)] p-1.5 text-muted hover:bg-surface-2 hover:text-text"
                        onClick={() => setResetting(u)}
                      >
                        <KeyRound className="size-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <CreateUserModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={load}
      />

      {editing && (
        <EditUserModal
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      )}

      <ConfirmDialog
        open={resetting !== null}
        title={t("admin.users.resetPasswordTitle")}
        message={t("admin.users.resetPasswordMessage", { username: resetting?.username ?? "" })}
        confirmLabel={t("admin.users.resetPassword")}
        cancelLabel={t("common.cancel")}
        loading={resetLoading}
        onConfirm={async () => {
          if (!resetting) return;
          setResetLoading(true);
          setError(null);
          try {
            const result = await api.admin.resetPassword(resetting.id);
            showGeneratedPassword(resetting.username, result.temporaryPassword ?? "");
          } catch {
            setError(t("common.errorGeneric"));
          } finally {
            setResetLoading(false);
          }
        }}
        onCancel={() => {
          setResetting(null);
          setError(null);
        }}
      >
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </ConfirmDialog>

      <Modal open={resetResult !== null} onClose={() => setResetResult(null)} title={t("admin.users.resetPasswordDone", { username: resetResult?.username ?? "" })}>
        <p className="rounded-[var(--radius)] bg-surface-2 p-3 font-mono text-base" dir="ltr">
          {resetResult?.password}
        </p>
        <p className="mt-2 text-xs text-muted">{t("admin.users.resetPasswordNote")}</p>
        <div className="mt-3 flex justify-end">
          <Button variant="secondary" onClick={() => setResetResult(null)}>
            {t("common.close")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function CreateUserModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => Promise<void> }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.admin.createUser({ username: username.trim(), password, role });
      toast(t("admin.users.userCreated", { username: username.trim() }));
      setUsername("");
      setPassword("");
      setRole("user");
      onClose();
      await onCreated();
    } catch (err) {
      setError(err instanceof ApiError && err.code === "username_taken" ? t("admin.users.usernameTaken") : t("common.errorGeneric"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t("admin.users.createTitle")}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label={t("auth.username")} htmlFor="cu-username">
          <Input id="cu-username" dir="ltr" required value={username} onChange={(e) => setUsername(e.target.value)} />
        </Field>
        <Field label={t("admin.users.initialPassword")} hint={t("admin.users.initialPasswordHint")} htmlFor="cu-password">
          <Input id="cu-password" type="text" dir="ltr" autoComplete="off" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label={t("admin.users.role")} htmlFor="cu-role">
          <Select id="cu-role" value={role} onChange={(e) => setRole(e.target.value as "user" | "admin")}>
            <option value="user">{t("admin.users.user")}</option>
            <option value="admin">{t("admin.users.admin")}</option>
          </Select>
        </Field>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
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

function EditUserModal({ user, onClose, onSaved }: { user: User; onClose: () => void; onSaved: () => Promise<void> }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [role, setRole] = useState<"user" | "admin">(user.role === "admin" ? "admin" : "user");
  const [isActive, setIsActive] = useState(user.isActive);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.admin.updateUser(user.id, { role, isActive });
      toast(t("admin.users.userUpdated"));
      onClose();
      await onSaved();
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === "last_admin"
          ? t("admin.users.disableSelf")
          : t("common.errorGeneric"),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={t("admin.users.editTitle")}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label={t("auth.username")}>
          <Input value={user.username} dir="ltr" disabled />
        </Field>
        <Field label={t("admin.users.role")} htmlFor="eu-role">
          <Select id="eu-role" value={role} onChange={(e) => setRole(e.target.value as "user" | "admin")}>
            <option value="user">{t("admin.users.user")}</option>
            <option value="admin">{t("admin.users.admin")}</option>
          </Select>
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="size-4 accent-[var(--accent)]"
          />
          {t("admin.users.active")}
        </label>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
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

/* ----------------------------- Settings ----------------------------- */

function SettingsTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setSettings(await api.admin.getSettings());
      } catch {
        setError(t("common.errorGeneric"));
      }
    })();
  }, [t]);

  if (!settings) {
    return (
      <div className="flex justify-center py-10">
        {error ? <p className="text-sm text-danger">{error}</p> : <Spinner className="size-5 text-muted" />}
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      setSettings(await api.admin.updateSettings(settings));
      toast(t("admin.settings.saved"));
    } catch {
      toast(t("common.errorGeneric"), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex max-w-xl flex-col gap-4">
      <Card className="flex flex-col gap-4 p-4">
        <Field label={t("admin.settings.appName")} htmlFor="st-name">
          <Input
            id="st-name"
            value={settings.appName}
            maxLength={100}
            onChange={(e) => setSettings({ ...settings, appName: e.target.value })}
          />
        </Field>
        <Field label={t("admin.settings.defaultLanguage")} htmlFor="st-lang">
          <Select
            id="st-lang"
            value={settings.defaultLanguage}
            onChange={(e) => setSettings({ ...settings, defaultLanguage: e.target.value as AppSettings["defaultLanguage"] })}
          >
            {LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>
                {lang === "en" ? t("admin.settings.languageEn") : t("admin.settings.languageFa")}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("admin.settings.defaultTimezone")} hint={t("account.timezoneHint")} htmlFor="st-tz">
          <Select
            id="st-tz"
            value={COMMON_TIMEZONES.includes(settings.defaultTimezone as never) ? settings.defaultTimezone : "custom"}
            onChange={(e) => {
              if (e.target.value !== "custom") {
                setSettings({ ...settings, defaultTimezone: e.target.value });
              }
            }}
          >
            {COMMON_TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
            {!COMMON_TIMEZONES.includes(settings.defaultTimezone as never) && (
              <option value="custom">{settings.defaultTimezone}</option>
            )}
          </Select>
        </Field>
      </Card>

      <Card className="flex flex-col gap-2 p-4">
        <p className="text-sm font-medium">{t("admin.settings.reportsVisibility")}</p>
        <label className="flex cursor-pointer items-start gap-2.5 rounded-[var(--radius)] border p-3" style={{ borderColor: settings.reportsVisibility === "private" ? "var(--accent)" : "var(--border)" }}>
          <input
            type="radio"
            name="visibility"
            checked={settings.reportsVisibility === "private"}
            onChange={() => setSettings({ ...settings, reportsVisibility: "private" })}
            className="mt-0.5 accent-[var(--accent)]"
          />
          <span>
            <span className="block text-sm font-medium">{t("admin.settings.visibilityPrivate")}</span>
            <span className="block text-xs text-muted">{t("admin.settings.visibilityPrivateHint")}</span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2.5 rounded-[var(--radius)] border p-3" style={{ borderColor: settings.reportsVisibility === "all_users" ? "var(--accent)" : "var(--border)" }}>
          <input
            type="radio"
            name="visibility"
            checked={settings.reportsVisibility === "all_users"}
            onChange={() => setSettings({ ...settings, reportsVisibility: "all_users" })}
            className="mt-0.5 accent-[var(--accent)]"
          />
          <span>
            <span className="block text-sm font-medium">{t("admin.settings.visibilityAll")}</span>
            <span className="block text-xs text-muted">{t("admin.settings.visibilityAllHint")}</span>
          </span>
        </label>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" loading={saving}>
          {t("common.save")}
        </Button>
      </div>
    </form>
  );
}
