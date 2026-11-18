import type { AuthUser, SetupStatus } from "@ryty/shared";
import type { Services } from "./services";
import { isValidTimezone } from "../utils/time";
import { badRequest } from "../utils/http";
import { ROLES } from "@ryty/shared";
import { hashPassword } from "../auth/password";

/** Public setup status (never exposes secret values). */
export async function getSetupStatus(services: Services): Promise<SetupStatus & { appName: string; defaultLanguage: string }> {
  const admins = await services.users.countActiveAdmins();
  const username = services.config.initialAdminUsername ?? "admin";
  const password = services.config.initialAdminPassword;
  const appSettings = await services.settings.getAppSettings();
  return {
    adminExists: admins > 0,
    bootstrapConfigured: Boolean(password),
    bootstrapUsername: password ? username : null,
    appName: appSettings.appName,
    defaultLanguage: appSettings.defaultLanguage,
  };
}

/** Source shape for building an AuthUser (user row or session user). */
type AuthUserSource = {
  id: number;
  username: string;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
  language?: string | null;
  theme?: string | null;
  timezone?: string | null;
};

/**
 * Map a user row to the API `AuthUser` shape with effective preferences:
 * personal value, else application default from the settings table.
 */
export async function toAuthUser(services: Services, user: AuthUserSource): Promise<AuthUser> {
  const appSettings = await services.settings.getAppSettings();
  const language = user.language ?? appSettings.defaultLanguage;
  let timezone = user.timezone ?? appSettings.defaultTimezone;
  if (!isValidTimezone(timezone)) timezone = "UTC";
  const theme = user.theme ?? "system";
  return {
    id: user.id,
    username: user.username,
    role: user.role as AuthUser["role"],
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    language: language as AuthUser["language"],
    timezone,
    theme: theme as AuthUser["theme"],
  };
}

/**
 * Create the initial administrator from the runtime bootstrap configuration.
 * Idempotent: only creates a new account when no active admin exists, the
 * config is present, and the configured username does not collide with an
 * existing account. Never called with hardcoded credentials.
 */
export async function bootstrapAdmin(services: Services): Promise<boolean> {
  const { config, users } = services;
  if (!config.initialAdminPassword) return false;
  const admins = await users.countActiveAdmins();
  if (admins > 0) return false;
  const username = config.initialAdminUsername ?? "admin";
  const existing = await users.findRowByUsername(username);
  if (existing) return false; // never elevate an unrelated existing account
  await users.create({
    username,
    passwordHash: await hashPassword(config.initialAdminPassword),
    role: ROLES.ADMIN,
    mustChangePassword: true,
  });
  return true;
}

/** Validate that a timezone string is a usable IANA identifier. */
export function ensureValidTimezone(timezone: string): void {
  if (!isValidTimezone(timezone)) {
    throw badRequest("invalid_timezone", "Unknown timezone identifier");
  }
}
