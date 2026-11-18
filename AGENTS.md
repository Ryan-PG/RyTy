# AGENTS.md — RyTy

Permanent instructions for coding agents working on this repository.

## Project

RyTy (رای تی) — a minimal, production-ready team activity & time-tracking
application. Single monorepo serving two deployment targets (Cloudflare
Workers + D1, and Docker + SQLite) from one shared codebase.

**Read `PROJECT-SPECIFICATION.md` before making significant changes.**
**Read `PROGRESS.md` to understand current implementation status.**

## Technology Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, React Router
  (library mode), i18next, zod, lucide-react icons.
- **Backend**: TypeScript, Hono, zod, session auth over HttpOnly cookies.
- **Database**: Drizzle ORM (sqlite-core). Cloudflare D1 adapter
  (`drizzle-orm/d1`) and Node adapter (`drizzle-orm/better-sqlite3`).
- **Runtimes**: Cloudflare Workers (primary) and Node 22 (Docker target).
- No other frameworks without documented justification.

## Folder Conventions

- `frontend/` — SPA. `src/components` (generic UI), `src/features/*`
  (auth, activities, timer, reports, users, settings), `src/pages`,
  `src/hooks`, `src/services` (API clients), `src/stores` (lightweight
  state), `src/i18n`, `src/types`.
- `backend/` — API. `routes/`, `middleware/`, `services/`,
  `repositories/`, `database/adapters/`, `database/schema/`,
  `validators/`, `auth/`. The backend entry is runtime-agnostic; runtime
  adapters live in `backend/src/runtime/` (`cloudflare.ts`, `node.ts`).
- `shared/` — types, zod schemas, constants shared by FE and BE.
- `migrations/` — SQL migrations shared by D1 and SQLite.
- `docker/` — Dockerfile. `scripts/` — helper scripts.

## Coding Standards

- All code comments in English.
- TypeScript strict mode; no `any` in shared/backend code.
- Validation via zod schemas defined in `shared/` and reused on both FE and
  BE — do not duplicate schemas.
- Do not introduce unnecessary dependencies. Justify any new dependency in
  PROGRESS.md.
- Match existing code style; keep modules small and focused.

## Database Rules

- All schema changes go through a new SQL migration file in `migrations/`
  plus the drizzle schema. Never rely on automatic schema synchronization.
- Migrations must be compatible with both D1 and SQLite (no PRAGMA tricks,
  no `ALTER COLUMN`).
- Access data only through repositories/adapters — never call drizzle or
  raw SQL directly from route handlers.
- Timestamps stored in UTC as ISO-8601 strings; durations as integer
  seconds; `occurred_on` as `YYYY-MM-DD` derived from the app timezone.

## API Conventions

- REST endpoints under `/api`, JSON envelope:
  `{ "data": ... }` on success, `{ "error": { "code", "message" } }` on
  failure.
- Validate every input with zod. Consistent HTTP status codes.
- Authorization enforced in middleware/services, never in the frontend
  only. Users must never read or mutate another user's activities.
- Never expose internal exceptions or secret values in responses.

## Security Requirements

- Never hardcode credentials or commit secrets. Initial admin password
  comes only from `INITIAL_ADMIN_PASSWORD` (Worker secret / `.env`).
- Passwords: PBKDF2-SHA256 (Web Crypto), 100 000 iterations, per-user
  salt. Never plain SHA-256.
- Sessions: random 32-byte tokens, store SHA-256 hash only, HttpOnly +
  SameSite=Lax (+ Secure in production) cookies, 7-day expiry.
- Rate-limit login attempts (DB-backed).
- Mutating requests require JSON content-type; check same-origin when
  `Origin` is present.

## UI/UX Principles

- Mobile-first; bottom navigation on mobile, compact nav on desktop.
- Dashboard is for quick activity entry — nothing else dominates it.
- Use the design tokens in `frontend/src/index.css` (colors, spacing,
  radii, type). Do not hardcode arbitrary styles.
- One icon family (lucide-react). No emoji as UI icons.
- Light, dark, and system themes; persist user choice.
- Handle empty, loading, error, and disabled states on every screen.
- Follow the installed `frontend-design` skill (`.zcode/skills/`):
  restrained, calm, hierarchy-first design; no AI-dashboard clutter.

## Internationalization Rules

- All user-facing strings live in `frontend/src/i18n/locales/{en,fa}.json`.
- No hardcoded English or Persian strings inside components.
- Persian = RTL: `dir` attribute must switch on `<html>`; use logical CSS
  properties (`ms-*`/`me-*`, `start/end`) instead of left/right.
- Numbers and dates formatted per active locale (Persian digits allowed in
  display, never in stored data).

## Testing Requirements

- `npm test` (Vitest) must pass before committing significant work.
- Business-logic unit tests (duration math, overlaps, CSV, password
  hashing, timer lifecycle) and API integration tests against the SQLite
  adapter. Same suite must be runnable against both adapters where
  practical.
- Verify a production build (`npm run build`) before declaring a phase done.

## Working Rules

- Do not run Git commit, push, branch, checkout, reset, or other
  repository-mutating Git operations unless explicitly authorized by the
  user for that specific action.
- Do not make major product or architectural decisions outside the approved
  specification without documenting and explaining them (in PROGRESS.md).
- The user has final authority over product decisions.
- Update PROGRESS.md after completing each meaningful phase. Never claim a
  task is done unless it is implemented and verified.
- `vim` may be used for terminal edits, but the agent harness file tools
  (Read/Write/Edit) are the preferred editors in this environment.

## Deployment Instructions

- Local dev: `npm install && npm run dev` (Cloudflare/Vite dev with local
  D1) — see README for details.
- Cloudflare: configure D1 + secret `INITIAL_ADMIN_PASSWORD`, run
  `npm run deploy` (wrangler). Git integration: build command
  `npm run build`.
- Docker: `docker compose up -d --build` with `.env` configured. Data
  persists in the `ryty-data` volume; updates must never delete data.
