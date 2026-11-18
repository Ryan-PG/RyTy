/**
 * Runtime-agnostic application configuration. Runtime adapters map their
 * native environment (Worker bindings/secrets or process.env) into this
 * shape; the shared application never touches platform-specific types.
 */

export interface AppConfig {
  /** Username of the initial administrator (defaults to "admin"). */
  initialAdminUsername?: string;
  /** Password of the initial administrator. Treated as a secret. */
  initialAdminPassword?: string;
  /** Fallback application timezone (IANA), before admin settings exist. */
  appTimezone?: string;
  /** Fallback default UI language ("en" | "fa"), before admin settings exist. */
  defaultLanguage?: string;
}

export interface RuntimeEnv {
  db: import("./database/adapter").AppDatabase;
  config: AppConfig;
}
