import { useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { LogOut } from "lucide-react";
import { COMMON_TIMEZONES, LANGUAGES, THEMES, type Language, type Theme } from "@ryty/shared";
import { useAuth } from "../stores/AuthContext";
import { useToast } from "../stores/ToastContext";
import { Button, Card, Field, Select } from "../components/ui";
import { ChangePasswordPage } from "./ChangePasswordPage";

/** Account settings: profile, preferences (language/theme/timezone), security. */
export function AccountPage() {
  const { t } = useTranslation();
  const { user, updatePreferences, logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  const onPreferenceChange = async (payload: { language?: Language; theme?: Theme; timezone?: string }) => {
    setSaving(true);
    try {
      await updatePreferences(payload);
      toast(t("account.saved"));
    } catch {
      toast(t("common.errorGeneric"), "error");
    } finally {
      setSaving(false);
    }
  };

  const onLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <h1 className="text-lg font-semibold">{t("account.title")}</h1>

      <Card className="p-4">
        <h2 className="mb-2 text-sm font-semibold text-muted">{t("account.profile")}</h2>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">{t("account.signedInAs")}</span>
          <span className="font-medium" dir="ltr">
            {user.username}
          </span>
        </div>
        <div className="mt-1.5 flex items-center justify-between text-sm">
          <span className="text-muted">{t("admin.users.role")}</span>
          <span className="font-medium">
            {user.role === "admin" ? t("admin.users.admin") : t("admin.users.user")}
          </span>
        </div>
      </Card>

      <Card className="flex flex-col gap-3.5 p-4">
        <h2 className="text-sm font-semibold text-muted">{t("account.preferences")}</h2>
        <Field label={t("account.language")} htmlFor="ac-lang">
          <Select
            id="ac-lang"
            value={user.language}
            disabled={saving}
            onChange={(e) => void onPreferenceChange({ language: e.target.value as Language })}
          >
            {LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>
                {lang === "en" ? "English" : "فارسی"}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("account.theme")} htmlFor="ac-theme">
          <Select
            id="ac-theme"
            value={user.theme}
            disabled={saving}
            onChange={(e) => void onPreferenceChange({ theme: e.target.value as Theme })}
          >
            {THEMES.map((theme) => (
              <option key={theme} value={theme}>
                {t(`account.theme${theme === "light" ? "Light" : theme === "dark" ? "Dark" : "System"}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("account.timezone")} hint={t("account.timezoneHint")} htmlFor="ac-tz">
          <Select
            id="ac-tz"
            value={COMMON_TIMEZONES.includes(user.timezone as never) ? user.timezone : "custom"}
            disabled={saving}
            onChange={(e) => {
              if (e.target.value !== "custom") void onPreferenceChange({ timezone: e.target.value });
            }}
          >
            {COMMON_TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
            {!COMMON_TIMEZONES.includes(user.timezone as never) && (
              <option value="custom">{user.timezone}</option>
            )}
          </Select>
        </Field>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-muted">{t("account.security")}</h2>
        <ChangePasswordPage />
      </Card>

      <Button variant="secondary" onClick={() => void onLogout()} className="w-full">
        <LogOut className="size-4" aria-hidden />
        {t("auth.logout")}
      </Button>
    </div>
  );
}
