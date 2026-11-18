import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import fa from "./locales/fa.json";
import type { Language } from "@ryty/shared";

export const resources = {
  en: { translation: en },
  fa: { translation: fa },
} as const;

export function isLanguage(value: string | null | undefined): value is Language {
  return value === "en" || value === "fa";
}

export function dirFor(language: Language): "ltr" | "rtl" {
  return language === "fa" ? "rtl" : "ltr";
}

/** Initialize i18next; the UI applies language changes via applyLanguage. */
export async function initI18n(): Promise<Language> {
  await i18next.use(initReactI18next).init({
    resources,
    lng: "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    returnEmptyString: false,
  });
  const stored = localStorage.getItem("ryty.language");
  return isLanguage(stored) ? stored : "en";
}

/** Apply a language everywhere: i18next, document direction and title font. */
export function applyLanguage(language: Language): void {
  void i18next.changeLanguage(language);
  document.documentElement.lang = language;
  document.documentElement.dir = dirFor(language);
  localStorage.setItem("ryty.language", language);
}
