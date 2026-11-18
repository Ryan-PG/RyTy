# PROJECT-SPECIFICATION.md — RyTy (رای تی)

> Authoritative product and technical specification for **RyTy**, a minimal team
> activity & time-tracking application. Keep this document updated when
> important architectural decisions change.

---

## 1. Product Purpose

RyTy is a lightweight tool for teams to record **what** they worked on, **how
long** it took, and **when** it happened. The core UX loop is:

1. Open the application.
2. Enter an activity.
3. Start tracking (or record time manually).
4. Leave.

Product principles: simplicity over feature quantity, mobile-first design,
fast interaction, minimal visual noise, clear hierarchy, progressive
disclosure. RyTy is **not** a project management platform, HR system, or
productivity suite (see §14 Out of Scope).

## 2. Features

### 2.1 Activity entry (three methods)

| Method | Inputs | Notes |
| --- | --- | --- |
| **Timer** | title, optional description | Start → pause → resume → stop. One active timer per user. Server-side timekeeping via database timestamps; survives refresh & browser closure. Starting a second timer is rejected. |
| **Manual time range** | title, description?, start, end | Duration computed automatically; invalid/negative ranges rejected; overlaps for the same user produce a clear warning the user can explicitly resolve. |
| **Manual duration** | title, description?, duration | Duration entered as h/m; stored as integer seconds; no timestamps required. |

### 2.2 Activity data model

`id`, `user_id`, `title`, `description`, `entry_type` (`timer` \| `range` \|
`duration`), `started_at` (nullable), `ended_at` (nullable),
`duration_seconds`, `occurred_on` (grouping date), `created_at`, `updated_at`.

Timestamps are stored in **UTC**. `occurred_on` is derived from a
configurable application timezone. Changing the timezone never silently
rewrites historical timestamps.

### 2.3 Reports

Daily / weekly / monthly summaries, custom date range, Admin user filter,
total duration, activity count, grouping by user and by activity title, CSV
export (UTF-8, BOM for Excel, proper escaping, Persian-safe, respects active
filters). Reports respect the configured visibility mode (§4).

### 2.4 Administration

- **User management**: list, create, edit, enable/disable, secure password
  reset, role assignment. The system must never lose its last active
  administrator (cannot disable/demote self if that would leave no admin).
- **Application settings**: application name, default language, default
  timezone, report visibility (`private` | `all_users`).

### 2.5 Account settings

Change password, language preference, theme preference (light / dark /
system), timezone preference, logout.

## 3. User Roles & Permissions

Exactly two roles: **Admin** and **User**. No public registration — only
Admin creates accounts.

| Capability | Admin | User |
| --- | :---: | :---: |
| View all activities / reports | ✅ | own only (or all if visibility = `all_users`) |
| Create / edit / delete own activities | ✅ | ✅ |
| Never modify another user's activities | — (enforced) | ✅ enforced |
| Manage users, app settings | ✅ | ❌ |
| Change own password & preferences | ✅ | ✅ |

All authorization is enforced **backend-side**; frontend checks are UX only.

## 4. Configurable Report Visibility

Admin setting `reports_visibility`:

- `private` (default): users see only their own activities and reports.
- `all_users`: all authenticated users can see other users' activities and
  reports (authenticated users of this app only — never public).

Enforced on every relevant backend endpoint.

## 5. Authentication & Security

- Username + password, session-based (no JWT in localStorage).
- Session token: 32 random bytes, only SHA-256 **hash** stored in DB.
- HttpOnly cookie, `Secure` in production, `SameSite=Lax`, 7-day expiration,
  server-side logout & revocation, expiration enforced.
- Password hashing: **PBKDF2-SHA256 via Web Crypto** (portable across
  Workers & Node), 100 000 iterations, 16-byte random salt, per-user.
  Plain SHA-256 is never used for passwords.
- Login rate limiting: DB-backed (`login_attempts`), 5 failures per
  username+IP per 15 minutes.
- CSRF: `SameSite=Lax` cookies, JSON content-type required for mutations,
  same-origin check on `Origin` when present.
- Secure, non-enumerable error messages; no internal exception leakage.

### 5.1 Initial admin bootstrap (no hardcoded credentials)

Provisioned exclusively through environment configuration:

```env
INITIAL_ADMIN_USERNAME=admin
INITIAL_ADMIN_PASSWORD=<secret>
```

- Cloudflare: Worker **secret** (never `vars`, never exposed/logged).
- Docker: `.env` file (git-ignored).
- Setup-status endpoint reports missing configuration **without** exposing
  secret values; a dedicated setup screen explains exactly how to configure
  the secret (`npx wrangler secret put INITIAL_ADMIN_PASSWORD` / edit `.env`).
  Secrets are never requested through a public web form.
- Bootstrap is idempotent and safe.

### 5.2 Mandatory first-login password change

On the initial admin's first login a dedicated, non-bypassable
password-change screen is shown. The new password is hashed and stored, the
bootstrap password is consumed, and future logins never require the
bootstrap secret. The same secure mechanism is available to all users and
reusable later via account settings.

## 6. UX / UI Requirements

- **Mobile-first**: bottom navigation on mobile, restrained compact
  navigation on desktop; touch-friendly; no horizontal scrolling.
- **Dashboard** (home after login): compact greeting, prominent activity
  input, timer controls, manual-entry option, today's total, active-timer
  indication, recent activities. No big charts, admin widgets, or card grids.
- **Progressive disclosure**: reports, admin, settings in secondary
  navigation only.
- **Themes**: light, dark, system; persisted per user; design tokens
  (colors, type scale, spacing, radii, states) — no hardcoded styles.
- **Visual identity**: calm, precise, professional, restrained. One accent,
  quiet neutral surfaces, thin borders, subtle shadows, one icon family
  (Lucide), consistent action vocabulary.
- **i18n**: complete English + Persian (فارسی) translations via i18next,
  full RTL for Persian / LTR for English, correct `dir` on `<html>`,
  Persian typography (Vazirmatn), locale-aware numbers & dates, language
  selection in settings, persistent preference. English default on fresh
  install. No hardcoded UI strings in components.

## 7. Architecture

Single monorepo, one shared application codebase for both deployment
targets. Business logic, API contracts, validation, auth and authorization
rules are identical; only infrastructure adapters differ.

```text
ryTy/
├── frontend/    # React + TypeScript + Vite + Tailwind (SPA)
├── backend/     # Hono API app (runtime-agnostic)
│   └── src/
│       ├── routes/          # REST handlers
│       ├── middleware/      # auth, role, csrf, error handling
│       ├── services/        # business logic
│       ├── repositories/    # data access interfaces
│       ├── database/
│       │   ├── adapters/    # d1 / node-sqlite implementations
│       │   └── schema/      # drizzle schema + migrations
│       ├── validators/      # zod schemas wired to shared
│       └── auth/            # password, session, bootstrap
├── shared/      # types, zod schemas, constants (consumed by FE & BE)
├── migrations/  # SQL migrations (shared by D1 & SQLite)
├── docker/      # Dockerfile (Node runtime for Docker target)
├── scripts/     # helper scripts
└── .github/workflows/
```

### 7.1 Runtime targets

| Target | Server | Database | Entry |
| --- | --- | --- | --- |
| **Cloudflare** (primary) | Single Worker (Hono) + Workers Assets for the built SPA | Cloudflare D1 | `npm run deploy` / Wrangler / Git integration |
| **Docker** | Node 22 + `@hono/node-server` serving the same Hono app + static SPA | SQLite file on a volume | `docker compose up -d --build` |

### 7.2 Data access

Drizzle ORM with `sqlite-core` schema; two dialect adapters
(`drizzle-orm/d1` and `drizzle-orm/better-sqlite3`) behind a repository
abstraction. Migrations are plain SQL shared by both targets; never rely on
automatic schema sync in production.

## 8. Database Design

Five tables:

- **users** — id, username (unique), password_hash, role, is_active,
  must_change_password, created_at, updated_at
- **activities** — id, user_id, title, description, entry_type, started_at,
  ended_at, duration_seconds, occurred_on, created_at, updated_at
- **sessions** — id, user_id, token_hash (unique), expires_at, created_at
- **settings** — key, value, updated_at
- **timers** — one row per user's active timer: id, user_id (unique),
  state (`running` | `paused`), started_at (segment start),
  accumulated_seconds, title, description, created_at, updated_at

Indexes on: `activities(user_id, occurred_on)`, `activities(started_at)`,
`activities(ended_at)`, `sessions(token_hash)`, `sessions(expires_at)`,
`timers(user_id)` unique. Foreign keys with cascade rules where appropriate.

**Timer lifecycle** (source of truth = DB timestamps; JS intervals are
display-only): `start` inserts a `running` row; `pause` adds the running
segment to `accumulated_seconds` and sets `paused`; `resume` records a new
segment start; `stop` computes final duration server-side and inserts the
`activity` row, deleting the timer row. Pause/stop are idempotent.

## 9. REST API

```
POST /api/auth/login            POST /api/auth/logout
GET  /api/auth/me               POST /api/auth/change-password
GET  /api/setup/status

GET|POST        /api/activities
GET|PATCH|DELETE /api/activities/:id

POST /api/timer/start | pause | resume | stop
GET  /api/timer/active

GET  /api/reports/summary | daily | weekly | monthly | export

GET|POST  /api/admin/users
PATCH     /api/admin/users/:id
POST      /api/admin/users/:id/reset-password
GET|PATCH /api/admin/settings
GET       /api/health
```

Consistent JSON envelope, Zod validation on every input, standard HTTP
status codes, pagination (`?page`/`?pageSize`) and filtering (`from`, `to`,
`q`, `userId`) on lists.

## 10. Environment Configuration

`.env.example` documents every variable (see README). Secrets stay out of
Git. Cloudflare uses Worker bindings (`DB`) and secrets
(`INITIAL_ADMIN_PASSWORD`); Docker/local load `.env`. No insecure default
credentials are ever used.

## 11. Acceptance Criteria

See TASK.md §20 (Definition of Done) — all 22 items. Summary: working local
app, secure bootstrap + forced password change, user management, all three
entry methods, persistent server-side timer, configurable report
visibility, CSV export, EN/FA + RTL/LTR, light/dark themes, polished mobile
UX, complete Cloudflare + Docker deployment configs, SQLite persistence
survives container recreation, automated tests pass, complete docs.

## 12. Testing Strategy

Vitest. Unit tests: duration math, overlap detection, CSV escaping, password
hashing, timer lifecycle. Integration tests: auth flows, authorization and
user isolation, report visibility, admin endpoints — run against the SQLite
adapter (in-memory). Production build verification in CI.

## 13. Deployment

- Cloudflare: `wrangler.jsonc` (D1 binding, assets), migrations via
  `wrangler d1 migrations`, `npm run deploy`, Git-integration-friendly
  build command `npm run build`, secrets documented.
- Docker: single container, Node 22, SQLite on `/data/ryty.db` volume,
  healthcheck hitting `/api/health`, restart policy, `.env` config; updates
  never delete data (volume persists).
- CI (GitHub Actions): install → typecheck → tests → build.

## 14. Out of Scope

Project management, subtasks, chat, comments, payroll, leave management,
complex attendance, automatic activity monitoring, native mobile apps,
notifications, BI dashboards, unnecessary integrations, public registration.
