/// <reference types="@cloudflare/workers-types" />

import { createApp } from "../index";
import { createD1Database } from "../database/adapters/d1";
import type { AppConfig, RuntimeEnv } from "../env";
import type { Hono } from "hono";

export interface Env {
  /** D1 database binding. */
  DB: D1Database;
  /** Workers Assets binding serving the built SPA. */
  ASSETS: Fetcher;
  // Vars and secrets:
  INITIAL_ADMIN_USERNAME?: string;
  INITIAL_ADMIN_PASSWORD?: string;
  APP_TIMEZONE?: string;
  DEFAULT_LANGUAGE?: string;
}

const appCache = new WeakMap<Env, Hono>();

function getApp(env: Env): Hono {
  let app = appCache.get(env);
  if (!app) {
    const config: AppConfig = {
      initialAdminUsername: env.INITIAL_ADMIN_USERNAME,
      initialAdminPassword: env.INITIAL_ADMIN_PASSWORD,
      appTimezone: env.APP_TIMEZONE,
      defaultLanguage: env.DEFAULT_LANGUAGE,
    };
    const runtimeEnv: RuntimeEnv = {
      db: createD1Database(env.DB),
      config,
    };
    app = createApp(runtimeEnv);
    appCache.set(env, app);
  }
  return app;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return getApp(env).fetch(request);
    }
    // Static assets (with SPA fallback handled by the assets binding).
    return env.ASSETS.fetch(request);
  },
};
