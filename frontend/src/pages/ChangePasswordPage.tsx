import { useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../services/api";
import { useAuth } from "../stores/AuthContext";
import { Button, Field, Input } from "../components/ui";
import { PASSWORD_MIN_LENGTH } from "@ryty/shared";

/**
 * Password change screen. Rendered in forced mode right after the initial
 * admin's first login (cannot be bypassed), and reusable from Account
 * settings.
 */
export function ChangePasswordPage({ forced = false }: { forced?: boolean }) {
  const { t } = useTranslation();
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError(t("auth.passwordMismatch"));
      return;
    }
    setLoading(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      await refresh();
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "invalid_credentials") setError(t("auth.wrongCurrentPassword"));
        else if (err.status === 0) setError(t("errors.network"));
        else setError(t("errors.validation_error"));
      } else {
        setError(t("common.errorGeneric"));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={forced ? "flex min-h-dvh items-center justify-center bg-bg px-4" : ""}>
      <form
        onSubmit={onSubmit}
        className={`w-full rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-sm ${
          forced ? "max-w-sm" : "max-w-sm"
        }`}
      >
        <h1 className="text-base font-semibold">{t("auth.forcedChangeTitle")}</h1>
        <p className="mt-1 text-sm text-muted">
          {forced ? t("auth.forcedChangeSubtitle") : t("account.logoutEverywhereNote")}
        </p>
        {!forced && user && (
          <p className="mt-2 text-xs text-faint">
            {t("account.signedInAs")}: <span dir="ltr">{user.username}</span>
          </p>
        )}
        <div className="mt-4 flex flex-col gap-3">
          <Field label={t("auth.currentPassword")} htmlFor="cp-current">
            <Input
              id="cp-current"
              type="password"
              autoComplete="current-password"
              dir="ltr"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </Field>
          <Field label={t("auth.newPassword")} hint={t("auth.newPasswordHint")} htmlFor="cp-new">
            <Input
              id="cp-new"
              type="password"
              autoComplete="new-password"
              dir="ltr"
              required
              minLength={PASSWORD_MIN_LENGTH}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </Field>
          <Field label={t("auth.confirmPassword")} htmlFor="cp-confirm">
            <Input
              id="cp-confirm"
              type="password"
              autoComplete="new-password"
              dir="ltr"
              required
              minLength={PASSWORD_MIN_LENGTH}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </Field>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <Button type="submit" loading={loading} className="h-10">
            {loading ? t("auth.changing") : t("auth.changePassword")}
          </Button>
        </div>
      </form>
    </div>
  );
}
