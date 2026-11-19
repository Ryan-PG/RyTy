import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { AuthUser, Language, Theme } from "@ryty/shared";
import { api, ApiError, type AppInfo } from "../services/api";
import { applyLanguage } from "../i18n";

interface AuthContextValue {
  user: AuthUser | null;
  appInfo: AppInfo | null;
  status: "loading" | "authenticated" | "unauthenticated";
  language: Language;
  theme: Theme;
  refresh: () => Promise<void>;
  login: (username: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  updatePreferences: (payload: { language?: Language; theme?: Theme; timezone?: string }) => Promise<void>;
  setLanguage: (language: Language) => void;
  effectiveTheme: "light" | "dark";
}

const AuthContext = createContext<AuthContextValue | null>(null);

const themeQuery = window.matchMedia("(prefers-color-scheme: dark)");

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [status, setStatus] = useState<AuthContextValue["status"]>("loading");
  const [language, setLanguageState] = useState<Language>("en");
  const [theme, setThemeState] = useState<Theme>("system");
  const [effectiveTheme, setEffectiveTheme] = useState<"light" | "dark">("light");

  const applyTheme = useCallback((next: Theme) => {
    setThemeState(next);
    localStorage.setItem("ryty.theme", next);
    const resolved =
      next === "system" ? (themeQuery.matches ? "dark" : "light") : next;
    setEffectiveTheme(resolved);
    document.documentElement.classList.toggle("dark", resolved === "dark");
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("ryty.theme");
    const valid: Theme[] = ["light", "dark", "system"];
    const initial = valid.includes(stored as Theme) ? (stored as Theme) : "system";
    applyTheme(initial);
    const listener = () => {
      if ((localStorage.getItem("ryty.theme") as Theme | null) === "system" || !localStorage.getItem("ryty.theme")) {
        applyTheme("system");
      }
    };
    themeQuery.addEventListener("change", listener);
    return () => themeQuery.removeEventListener("change", listener);
  }, [applyTheme]);

  const applyUserLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    applyLanguage(next);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const me = await api.me();
      setUser(me);
      setStatus("authenticated");
      // The server-resolved preference is authoritative; localStorage is
      // only a pre-render hint and gets overwritten here.
      applyUserLanguage(me.language);
      applyTheme(me.theme as Theme);
    } catch {
      setUser(null);
      setStatus("unauthenticated");
    }
  }, [applyTheme, applyUserLanguage]);

  const refreshAppInfo = useCallback(async () => {
    try {
      setAppInfo(await api.setupStatus());
    } catch {
      setAppInfo(null);
    }
  }, []);

  useEffect(() => {
    void refreshAppInfo();
    void refresh();
  }, [refresh, refreshAppInfo]);

  const login = useCallback(
    async (username: string, password: string) => {
      const me = await api.login(username, password);
      setUser(me);
      setStatus("authenticated");
      applyUserLanguage(me.language);
      applyTheme(me.theme as Theme);
      return me;
    },
    [applyTheme, applyUserLanguage],
  );

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // ignore network failures on logout
    }
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  const updatePreferences = useCallback(
    async (payload: { language?: Language; theme?: Theme; timezone?: string }) => {
      const me = await api.updatePreferences(payload);
      setUser(me);
      if (payload.language) applyUserLanguage(me.language);
      applyTheme(me.theme as Theme);
    },
    [applyTheme, applyUserLanguage],
  );

  const setLanguage = useCallback(
    (next: Language) => {
      applyUserLanguage(next);
    },
    [applyUserLanguage],
  );

  const value = useMemo(
    () => ({
      user,
      appInfo,
      status,
      language,
      theme,
      effectiveTheme,
      refresh,
      login,
      logout,
      updatePreferences,
      setLanguage,
    }),
    [user, appInfo, status, language, theme, effectiveTheme, refresh, login, logout, updatePreferences, setLanguage],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { ApiError };
