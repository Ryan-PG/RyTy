import { useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { ApiError } from "../services/api";
import { useAuth } from "../stores/AuthContext";
import { Button, Field, Input } from "../components/ui";

export function LoginPage() {
  const { t } = useTranslation();
  const { login, appInfo } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const me = await login(username, password);
      navigate(me.mustChangePassword ? "/change-password" : "/", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "rate_limited") setError(t("auth.rateLimited"));
        else if (err.status === 0) setError(t("errors.network"));
        else setError(t("auth.invalidCredentials"));
      } else {
        setError(t("common.errorGeneric"));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <img src="/favicon.svg" alt="" className="size-12" />
          <h1 className="text-xl font-semibold text-text">
            {t("auth.loginTitle")}
          </h1>
          <p className="text-sm text-muted">{t("auth.loginSubtitle")}</p>
        </div>
        <form
          onSubmit={onSubmit}
          className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-sm"
        >
          <div className="flex flex-col gap-3">
            <Field label={t("auth.username")} htmlFor="login-username">
              <Input
                id="login-username"
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                dir="ltr"
                required
                value={username}
                placeholder={t("auth.usernamePlaceholder")}
                onChange={(e) => setUsername(e.target.value)}
              />
            </Field>
            <Field label={t("auth.password")} htmlFor="login-password">
              <Input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                dir="ltr"
                required
                value={password}
                placeholder={t("auth.passwordPlaceholder")}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <Button type="submit" loading={loading} className="h-10 w-full">
              {loading ? t("auth.signingIn") : t("auth.signIn")}
            </Button>
          </div>
        </form>
        <p className="mt-4 text-center text-xs text-faint">
          {appInfo?.appName ?? "RyTy"}
        </p>
      </div>
    </div>
  );
}
