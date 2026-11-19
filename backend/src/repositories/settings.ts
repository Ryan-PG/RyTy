import { settings } from "../database/schema";
import type { AppDatabase } from "../database/adapter";
import { SETTINGS_DEFAULTS, type AppSettings } from "@ryty/shared";

export function createSettingsRepository(db: AppDatabase) {
  async function readAll(): Promise<Record<string, string>> {
    const rows = await db.select().from(settings);
    const map: Record<string, string> = {};
    for (const row of rows) map[row.key] = row.value;
    return map;
  }

  return {
    async readAll() {
      return readAll();
    },

    async write(key: string, value: string): Promise<void> {
      const now = new Date().toISOString();
      // Upsert compatible with D1 and SQLite.
      await db
        .insert(settings)
        .values({ key, value, updatedAt: now })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value, updatedAt: now },
        });
    },

    /** Effective application settings: stored value ?? default. */
    async getAppSettings(): Promise<AppSettings> {
      const map = await readAll();
      return {
        appName: map.app_name ?? SETTINGS_DEFAULTS.app_name,
        defaultLanguage: (map.default_language ?? SETTINGS_DEFAULTS.default_language) as AppSettings["defaultLanguage"],
        defaultTimezone: map.default_timezone ?? SETTINGS_DEFAULTS.default_timezone,
        reportsVisibility: (map.reports_visibility ?? SETTINGS_DEFAULTS.reports_visibility) as AppSettings["reportsVisibility"],
        currency: map.currency ?? SETTINGS_DEFAULTS.currency,
        dateFormat: (map.date_format ?? SETTINGS_DEFAULTS.date_format) as AppSettings["dateFormat"],
      };
    },
  };
}

export type SettingsRepository = ReturnType<typeof createSettingsRepository>;
