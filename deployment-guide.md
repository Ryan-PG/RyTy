# RyTy — Cloudflare Deployment Guide

Complete deployment documentation for hosting RyTy on **Cloudflare Workers**
with **Cloudflare D1** as the database — either manually with Wrangler or
automatically through Cloudflare Workers Builds (GitHub integration).

**Language:** English · [فارسی](./deployment-guide.fa.md)

---

## Contents

1. [Architecture overview](#1-architecture-overview)
2. [Which deployment path?](#2-which-deployment-path)
3. [Prerequisites](#3-prerequisites)
4. [Get the code](#4-get-the-code)
5. [Connect Wrangler to Cloudflare](#5-connect-wrangler-to-cloudflare)
6. [Your D1 database (new or existing)](#6-your-d1-database-new-or-existing)
7. [The Wrangler configuration template](#7-the-wrangler-configuration-template)
8. [Environment variables and secrets](#8-environment-variables-and-secrets)
9. [Database migrations](#9-database-migrations)
10. [Deploy manually (Wrangler CLI)](#10-deploy-manually-wrangler-cli)
11. [Deploy with Cloudflare Workers Builds (Git integration)](#11-deploy-with-cloudflare-workers-builds-git-integration)
12. [First login and the initial administrator](#12-first-login-and-the-initial-administrator)
13. [Custom domain](#13-custom-domain)
14. [Production verification checklist](#14-production-verification-checklist)
15. [Useful commands](#15-useful-commands)
16. [Database backups](#16-database-backups)
17. [Schema changes in future releases](#17-schema-changes-in-future-releases)
18. [Troubleshooting](#18-troubleshooting)
19. [Local development](#19-local-development)
20. [Operational rules](#20-operational-rules)

---

## 1. Architecture Overview

RyTy is deployed as a single Cloudflare Worker that serves both the REST API
and the built SPA from one origin, backed by one D1 database.

```text
                         GitHub Repository
                               |
                               | Push to main
                               v
                    Cloudflare Workers Builds
                               |
          1. npm ci            |
          2. npm run config:generate   (creates wrangler.jsonc from the template)
          3. npm run build             |
          4. npm run deploy:cf         |
             |-- applies remote D1 migrations
             |-- wrangler deploy
                               v
                    Cloudflare Worker (ryty)
                               |
                  +------------+------------+
                  |                         |
                  v                         v
            Workers Assets              Hono API
            (React SPA)                     |
                                            v
                                       Cloudflare D1
```

### Infrastructure components

| Component          | Purpose                                        |
| ------------------ | ---------------------------------------------- |
| Cloudflare Workers | Runs the backend API                           |
| Workers Assets     | Serves the frontend application                |
| Cloudflare D1      | Stores application data                        |
| Workers Builds     | Builds and deploys automatically from GitHub   |
| Cloudflare Secrets | Stores sensitive runtime configuration         |
| Cloudflare DNS/SSL | Custom domain and HTTPS                        |

### Why this architecture?

- No VPS, no Docker required for the Cloudflare target.
- Frontend and backend share the same origin (no CORS, no separate hosting).
- Every deployment gets its own database configuration; nothing
  environment-specific is committed to the public repository.
- Migrations are applied before every deploy, so the schema and the code
  move together.

---

## 2. Which deployment path?

| Path | When to use | Automated? |
| --- | --- | --- |
| **Manual (Wrangler CLI)** — §10 | First deployment, or when you prefer explicit control | No |
| **Cloudflare Workers Builds (Git)** — §11 | Day-to-day: every push to `main` builds and deploys | Yes |
| **Docker / Node** | Self-hosted servers | See [README.md](./README.md) |

All three paths use the same code and the same migration files. The Cloudflare
paths differ only in *who runs the build* (you or Cloudflare).

---

## 3. Prerequisites

- A Cloudflare account (free plan is sufficient).
- Node.js **22** and npm installed locally.
- Git (to clone the repository).
- For the Git-integration path: a GitHub account with access to your RyTy fork/clone.

Verify the Node version:

```powershell
node --version   # must be 22.x
npm --version
```

---

## 4. Get the Code

```powershell
git clone https://github.com/Ryan-PG/RyTy.git
cd RyTy
npm install
```

---

## 5. Connect Wrangler to Cloudflare

Wrangler is the Cloudflare CLI used to manage Workers, D1 databases, secrets
and deployments. It ships with the project as a dev dependency — use `npx`.

```powershell
npx wrangler login
npx wrangler whoami   # should print your account
```

---

## 6. Your D1 Database (New or Existing)

### Scenario A — new deployment (your own instance)

Create **your own** D1 database:

```powershell
npx wrangler d1 create ryty
```

Cloudflare returns:

```text
database_name = "ryty"
database_id  = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Copy the `database_id` — you will need it as the `D1_DATABASE_ID`
environment variable in the next sections.

### Scenario B — existing deployment (upgrading the current instance)

If a `ryty` database already exists in your account (for example the
production database), **do not create a new one**. Find its id:

```powershell
npx wrangler d1 list
```

and use that id as `D1_DATABASE_ID`.

> **Important:** generating `wrangler.jsonc` never creates a database and
> never deletes or recreates one. It only points a Worker at the database id
> you give it. Always make sure the configured id is the database you intend
> to use — deploying with the wrong id points the Worker at the wrong data.

---

## 7. The Wrangler Configuration Template

The real `wrangler.jsonc` is **not committed** to Git (it is listed in
`.gitignore` because it contains *your* database id). Instead, the repository
contains a public template and a small generator:

| File | Committed? | Purpose |
| --- | --- | --- |
| `wrangler.example.jsonc` | ✅ yes | Template with all shared Worker settings and the placeholder `REPLACE_WITH_YOUR_D1_DATABASE_ID` |
| `scripts/generate-wrangler.mjs` | ✅ yes | Reads `D1_DATABASE_ID` from the environment, validates it, and writes `wrangler.jsonc` |
| `wrangler.jsonc` | ❌ no (generated) | The actual configuration used by Wrangler and the Vite/Cloudflare tooling |

The template contains (excerpt):

```jsonc
{
  "name": "ryty",
  "main": "backend/src/runtime/cloudflare.ts",
  "assets": { "binding": "ASSETS", "not_found_handling": "single-page-application" },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "ryty",
      "database_id": "REPLACE_WITH_YOUR_D1_DATABASE_ID",
      "migrations_dir": "migrations",
    },
  ],
  "vars": {
    "APP_TIMEZONE": "UTC",
    "DEFAULT_LANGUAGE": "en",
    "INITIAL_ADMIN_USERNAME": "admin",
  },
}
```

### Generating the configuration

```powershell
# PowerShell
$env:D1_DATABASE_ID = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
npm run config:generate
```

```bash
# bash
D1_DATABASE_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx npm run config:generate
```

The generator:

1. Reads `D1_DATABASE_ID` from `process.env`.
2. Validates that it is present and a valid UUID.
3. Replaces the placeholder in `wrangler.example.jsonc`.
4. Writes the result to `wrangler.jsonc` in the project root.

If `D1_DATABASE_ID` is missing, the generator fails with
`D1_DATABASE_ID environment variable is missing.` If the value is not a UUID,
it fails with `D1_DATABASE_ID is not a valid UUID.` In both cases no output
file is written.

> **Do not commit the generated `wrangler.jsonc`.** It contains your
> environment-specific database id. Also never put secrets in it — secrets
> belong in the Worker's secret store (§8).

---

## 8. Environment Variables and Secrets

There are three distinct places where configuration lives. Mixing them up is
the most common deployment mistake:

| Where | Visible during | Used for | Examples |
| --- | --- | --- | --- |
| **Build variables** (Workers Builds → Build variables and secrets, or your local shell) | The build process only | Generating `wrangler.jsonc` | `D1_DATABASE_ID` |
| **Worker runtime variables** (`vars` in `wrangler.jsonc`, or the Worker's Variables settings) | The deployed Worker | Public, non-sensitive configuration | `APP_TIMEZONE`, `DEFAULT_LANGUAGE`, `INITIAL_ADMIN_USERNAME` |
| **Worker runtime secrets** (`npx wrangler secret put …`) | The deployed Worker | Sensitive values | `INITIAL_ADMIN_PASSWORD` |

**Critical:** `D1_DATABASE_ID` **must be configured as a build variable**.
A Worker runtime variable or runtime secret is *not* available to the build
process — `scripts/generate-wrangler.mjs` runs during the build and reads
`process.env.D1_DATABASE_ID`. Setting it only under the Worker's runtime
Variables/Secrets will make the build fail with
`D1_DATABASE_ID environment variable is missing.`

| Variable | Kind | Where | Purpose |
| --- | --- | --- | --- |
| `D1_DATABASE_ID` | Build variable/secret | Workers Builds build variables (or your shell for manual deploys) | Your D1 database id; injected into the generated `wrangler.jsonc` |
| `INITIAL_ADMIN_PASSWORD` | Worker **secret** | `npx wrangler secret put INITIAL_ADMIN_PASSWORD` | Bootstrap admin password; used only until first login, then a change is forced |
| `INITIAL_ADMIN_USERNAME` | Worker var | `vars` in the template (default `admin`) | Bootstrap admin username |
| `APP_TIMEZONE` | Worker var | `vars` in the template (default `UTC`) | Fallback timezone for day grouping; changeable later in Admin → Settings |
| `DEFAULT_LANGUAGE` | Worker var | `vars` in the template (default `en`) | Default UI language `en` \| `fa` |

In-app settings (Admin → Settings) — application name, default language,
timezone, report visibility, **currency**, **date format (Gregorian/Jalali)** —
are stored in the database and take precedence over the environment
fallbacks once changed.

Docker/local deployments use the same names in `.env` — see
[README.md](./README.md#️-environment-variables).

---

## 9. Database Migrations

Migration files live in [`migrations/`](./migrations) as plain SQL, shared by
D1 and SQLite. The migrations directory is configured through the
`migrations_dir` property of the D1 binding in the Wrangler template
(`"migrations"`).

```powershell
# Check what is pending on the remote database
npx wrangler d1 migrations list ryty --remote

# Apply pending migrations to the remote (production) database
npx wrangler d1 migrations apply ryty --remote
```

Notes:

- Wrangler tracks applied migrations; re-running applies nothing new.
- `--local` applies to the local development D1 (§19), not production.
- `npm run deploy` and `npm run deploy:cf` run remote migrations
  automatically **before** deploying the Worker. If a migration fails, the
  deploy command stops and the new Worker is **not** deployed.
- To avoid touching the wrong database, always check
  `npx wrangler d1 list` and confirm the id you configured in
  `D1_DATABASE_ID` before applying anything with `--remote`.
- Never recreate the database to "fix" a failed migration. Inspect the error
  first (see §18).

---

## 10. Deploy Manually (Wrangler CLI)

### 10.1 One-shot deploy (recommended for the first deploy)

```powershell
# with D1_DATABASE_ID set in your shell
npm run deploy
```

`npm run deploy` runs, in order:

```text
npm run config:generate   → creates wrangler.jsonc from the template
npm run build             → builds client + server bundle
npm run db:migrate:d1:remote → applies pending remote D1 migrations
wrangler deploy           → uploads the Worker and assets
```

### 10.2 Partial commands

| Command | Steps | Typical use |
| --- | --- | --- |
| `npm run config:generate` | generate `wrangler.jsonc` | after changing `D1_DATABASE_ID` or the template |
| `npm run build` | client + server build | verify a build locally |
| `npm run deploy:cf` | remote migrations + `wrangler deploy` | config already generated, code rebuilt |
| `npm run deploy:cf-only` | `wrangler deploy` only | emergency redeploy; **skips migrations** — only when the remote schema is already compatible |

### 10.3 Verify the deployment

```powershell
curl https://ryty.<your-subdomain>.workers.dev/api/health
```

Expected:

```json
{ "data": { "status": "ok", "database": "ok" } }
```

`"database": "ok"` confirms the Worker can reach its D1 database.

---

## 11. Deploy with Cloudflare Workers Builds (Git Integration)

After the first manual deployment (or straight away, if you prefer), connect
the repository so every push to `main` builds and deploys automatically.

### 11.1 Connect the repository

1. Cloudflare Dashboard → **Workers & Pages** → create/connect via the Git
   integration (Workers Builds) workflow.
2. Select **GitHub** as the source provider and authorize Cloudflare.
3. Select the repository (e.g. `Ryan-PG/RyTy`) and the production branch
   `main`.

### 11.2 Build configuration

| Setting | Value |
| --- | --- |
| Worker name | `ryty` |
| Production branch | `main` |
| Root directory | `/` (repository root) |
| Install command | `npm ci` (default) |
| **Build command** | `npm run config:generate && npm run build` |
| **Deploy command** | `npm run deploy:cf` |

The build command **must** run `config:generate` first: every step that uses
Wrangler (the Vite Cloudflare build and `wrangler deploy`) needs the
generated `wrangler.jsonc`. The deploy command then applies pending remote
migrations before `wrangler deploy`.

### 11.3 Configure `D1_DATABASE_ID` as a build variable

In the Workers Builds configuration for the Worker, under **Build variables
and secrets**, add:

```text
D1_DATABASE_ID = <your-d1-database-id>
```

This is **not** the same place as the Worker's runtime Variables/Secrets —
the build process cannot see runtime values. The build sequence is:

```text
1. Cloudflare starts the build, injecting build variables into the environment
2. npm run config:generate   → reads D1_DATABASE_ID, writes wrangler.jsonc
3. npm run build             → client + server bundle
4. npm run deploy:cf         → remote D1 migrations → wrangler deploy
```

### 11.4 Production secrets and runtime variables

The deployed Worker still needs its runtime configuration — these are *not*
transferred from your machine or from the build:

- `INITIAL_ADMIN_PASSWORD` as a Worker **secret**:
  `npx wrangler secret put INITIAL_ADMIN_PASSWORD`
- `APP_TIMEZONE`, `DEFAULT_LANGUAGE`, `INITIAL_ADMIN_USERNAME` as Worker
  `vars` (the generated `wrangler.jsonc` already includes the defaults; keep
  them, or adjust them in the template before generating).

### 11.5 Existing Worker / existing database

When connecting Git integration to an already-running deployment:

- Keep the Worker name `ryty` so you update the existing Worker instead of
  creating a new one.
- Use the **existing** production database id as `D1_DATABASE_ID` — do not
  create a new database for ongoing deployments.
- Keep the `DB` binding name, database name `ryty` and `migrations_dir` as in
  the template.
- If the dashboard workflow tries to create a *new* Worker instead of
  updating the existing one, stop and verify the configuration first.

### 11.6 Day-to-day deploys

```powershell
git add .
git commit -m "Update application"
git push origin main
```

Cloudflare builds and deploys automatically. Monitor progress under
**Workers & Pages → ryty → Deployments** (build logs, deploy logs, migration
output). Manual `npm run deploy` is no longer needed for normal changes.

---

## 12. First Login and the Initial Administrator

Setting the `INITIAL_ADMIN_PASSWORD` secret does **not** create an account by
itself. The account is created on the first login attempt that matches the
bootstrap configuration:

1. Open the deployed application.
2. Sign in with the configured username (default `admin`) and the
   `INITIAL_ADMIN_PASSWORD` value.
3. The backend detects that no active administrator exists and that the
   submitted credentials match the configured bootstrap values, then creates
   the administrator (password hashed with PBKDF2-SHA256, 100 000 iterations,
   per-user salt) and continues the login.
4. The application **forces a password change** before anything else can be
   used. The bootstrap password is never valid again after that.

Notes:

- Bootstrap is idempotent: it only runs while no active administrator exists.
- Changing the secret later does **not** reset an existing administrator's
  password. Use Admin → Users → Reset password for that.
- If the secret is missing, the application shows a setup screen with the
  exact command instead of ever using an insecure default.

---

## 13. Custom Domain

Cloudflare provides a `*.workers.dev` URL. For production, attach a custom
domain:

1. Cloudflare Dashboard → Workers & Pages → `ryty` → **Settings** →
   **Domains & Routes** → **Add** → **Custom domain**.
2. Enter the domain (e.g. `ryty.example.com`). The DNS zone must be active in
   the same Cloudflare account.
3. Wait for DNS and SSL provisioning, then verify:

```text
https://<your-domain>/            → the app
https://<your-domain>/api/health  → {"data":{"status":"ok","database":"ok"}}
```

---

## 14. Production Verification Checklist

### Infrastructure

- [ ] Worker `ryty` is deployed (not a new Worker with a similar name).
- [ ] The frontend loads from the same origin.
- [ ] `/api/health` returns `"database": "ok"`.
- [ ] Pending migrations are applied (`d1 migrations list ryty --remote`).
- [ ] `D1_DATABASE_ID` is present in Workers Builds **build variables**.
- [ ] `INITIAL_ADMIN_PASSWORD` is configured as a Worker **secret**.
- [ ] Custom domain works over HTTPS (if used).

### Application

- [ ] Bootstrap admin can log in and is forced to change the password.
- [ ] Timer start/pause/resume/stop and cancel work.
- [ ] Manual time-range and duration entries work; overlap warning appears.
- [ ] Expenses can be added, edited and deleted; the currency shows correctly.
- [ ] Reports load for daily/weekly/monthly/custom; the per-day chart shows
      exactly the past 7 days.
- [ ] CSV export downloads a valid UTF-8 file.
- [ ] Date format setting (Gregorian/Jalali) renders accordingly.
- [ ] Persian and English interfaces work (RTL/LTR).
- [ ] Data survives a redeploy (activities, expenses, users).

### Security

- [ ] The initial password is not committed to Git.
- [ ] Invalid logins are rejected; inactive users cannot sign in.
- [ ] Admin endpoints require the admin role.
- [ ] Users cannot read or mutate other users' activities or expenses.

---

## 15. Useful Commands

All commands run from the repository root.

```powershell
# Authentication
npx wrangler login
npx wrangler whoami
npx wrangler --version

# D1 databases
npx wrangler d1 list
npx wrangler d1 create ryty
npx wrangler d1 migrations list ryty --remote
npx wrangler d1 migrations apply ryty --remote
npx wrangler d1 execute ryty --remote --command "SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name;"

# Secrets
npx wrangler secret put INITIAL_ADMIN_PASSWORD

# Build & deploy
npm run config:generate
npm run build
npm run deploy
npm run deploy:cf
npm run deploy:cf-only
```

---

## 16. Database Backups

```powershell
npx wrangler d1 export ryty --remote --output=./ryty-backup.sql
```

- Never commit backups to Git; keep them in secure storage.
- Test restoration before relying on backups.
- For production use, schedule regular exports instead of ad-hoc copies.

---

## 17. Schema Changes in Future Releases

Migrations run automatically before every deploy (manual and Git-integrated).
Recommended workflow:

```text
1. Create the migration (npm run db:generate, then review the SQL)
2. Test locally (npm run db:migrate:d1:local)
3. Commit the migration file with the code that uses it
4. Push → Cloudflare applies pending remote migrations, then deploys
5. Verify /api/health and the affected features
```

Safety rules:

- Prefer backward-compatible migrations (add columns/tables before code uses
  them; remove old structures only after no deployed code depends on them).
- Never rename or drop columns without a compatibility plan
  (SQLite/D1 have no `ALTER COLUMN`).
- Back up the database before risky schema changes.

---

## 18. Troubleshooting

| Problem | Explanation and fix |
| --- | --- |
| **No configuration file found** (`wrangler.jsonc` missing) | The generation step did not run or failed. Run `npm run config:generate` (locally with `D1_DATABASE_ID` set) or make sure the Workers Builds build command includes it. |
| **`D1_DATABASE_ID environment variable is missing.`** | The generator ran without the variable. For manual deploys set it in your shell; for Workers Builds set it under **Build variables and secrets** — runtime variables/secrets are *not* visible to the build. |
| **`D1_DATABASE_ID is not a valid UUID.`** | The configured id is malformed. Copy the exact `database_id` from `npx wrangler d1 create` / `npx wrangler d1 list`. |
| **Database not found / binding errors** | The id points to a database in another account, or the database was deleted. Verify `npx wrangler d1 list` and the configured id. |
| **Migration fails** | Inspect the SQL and the current remote schema (`d1 migrations list ryty --remote`, `d1 execute …`). Do not recreate the database. The deploy command stops before deploying when migrations fail. |
| **Worker deploy fails** | Check the build output, the generated `wrangler.jsonc`, Wrangler permissions and the Cloudflare deploy logs. |
| **Secret unavailable at runtime** (setup screen keeps appearing) | `INITIAL_ADMIN_PASSWORD` was not configured as a **Worker secret** — `npx wrangler secret put INITIAL_ADMIN_PASSWORD`, then redeploy if needed. Build variables do not count. |
| **Login fails although the secret is set** | An administrator may already exist (bootstrap only runs when none exists), the username may differ from `INITIAL_ADMIN_USERNAME`, or the password does not match. Check `/api/setup/status` — it reports `adminExists`/`bootstrapConfigured` without exposing secrets. |
| **New deployment created instead of updating the existing Worker** | The Workers Builds workflow was pointed at a different Worker name or account. Stop, delete nothing, and reconnect with the correct name/credentials. |

---

## 19. Local Development

Local development uses the same Cloudflare toolchain (Vite + Workers runtime +
local D1) and therefore needs a generated `wrangler.jsonc` too — but **no**
real database or production configuration:

```powershell
# 1. Generate a local wrangler.jsonc — any valid UUID works for local D1.
#    (PowerShell)
$env:D1_DATABASE_ID = "00000000-0000-0000-0000-000000000000"
npm run config:generate

# 2. Create the local D1 schema
npm run db:migrate:d1:local

# 3. Configure the local bootstrap admin (.dev.vars, git-ignored)
#    INITIAL_ADMIN_USERNAME=admin
#    INITIAL_ADMIN_PASSWORD=choose-a-long-password

# 4. Run the dev server (Vite + Cloudflare Workers runtime)
npm run dev
```

The local `D1_DATABASE_ID` never touches production — local development only
reads/writes the local D1 simulator under `.wrangler/`. Never use your real
production database id for local work.

The Docker/Node target can also be run locally:

```powershell
npm run build
INITIAL_ADMIN_USERNAME=admin INITIAL_ADMIN_PASSWORD=choose-a-long-password npm start
```

Differences between the runtimes are limited to infrastructure adapters
(`drizzle-orm/d1` vs `drizzle-orm/libsql`); the API, validation and business
rules are one shared codebase.

---

## 20. Operational Rules

1. Never commit production passwords, secrets or the generated
   `wrangler.jsonc` to Git.
2. Never replace the production D1 database id accidentally — double-check
   `D1_DATABASE_ID` whenever the deployment stops building.
3. Never recreate the production database to fix a deployment issue.
4. Always inspect migrations before applying them to production.
5. Prefer the Git-integration path for day-to-day deploys; keep the manual
   path for controlled maintenance.
6. Keep backups outside the repository and test restores.
7. Verify `/api/health` after every deployment.
8. `D1_DATABASE_ID` belongs in **build variables**; `INITIAL_ADMIN_PASSWORD`
   belongs in **Worker secrets**; `APP_TIMEZONE`/`DEFAULT_LANGUAGE`/
   `INITIAL_ADMIN_USERNAME` belong in **Worker vars**.

---

**Summary of the deployment model:**

```text
GitHub push → Cloudflare Workers Builds
  → npm ci
  → npm run config:generate   (D1_DATABASE_ID from build variables)
  → npm run build
  → npm run deploy:cf         (remote D1 migrations → wrangler deploy)
  → Worker + Workers Assets on Cloudflare, data in your D1 database
```

The repository stays free of environment-specific configuration: every
deployment generates its own `wrangler.jsonc` from the committed template and
its own database id.
