# RyTy – Cloudflare Deployment Guide

Complete deployment documentation for hosting RyTy on Cloudflare Workers, using Cloudflare D1 as the database and GitHub integration for automated deployments.

---

## 1. Architecture Overview

RyTy uses a single-origin deployment architecture on Cloudflare.

```text
                         GitHub Repository
                         Ryan-PG/RyTy
                               |
                               | Push to main
                               v
                    Cloudflare Workers Builds
                               |
                               | Build & Deploy
                               v
                    Cloudflare Worker (ryty)
                               |
                 +-------------+-------------+
                 |                           |
                 v                           v
          Static Assets                 Hono API
          React + Vite                     |
                                           |
                                           v
                                    Cloudflare D1
                                    SQLite Database
```

### Infrastructure Components

| Component          | Purpose                                      |
| ------------------ | -------------------------------------------- |
| Cloudflare Workers | Runs the backend API                         |
| Workers Assets     | Serves the frontend application              |
| Cloudflare D1      | Stores application data                      |
| Workers Builds     | Automatically builds and deploys from GitHub |
| Cloudflare Secrets | Stores sensitive configuration               |
| Cloudflare DNS     | Manages the custom domain                    |
| Cloudflare SSL     | Provides HTTPS                               |

### Why This Architecture?

- No VPS or dedicated server is required.
- No Docker installation is required for Cloudflare deployment.
- Frontend and backend share the same origin.
- D1 provides persistent database storage.
- GitHub pushes can trigger automatic deployments.
- Sensitive configuration stays outside the repository.

---

## 2. Prerequisites

Before starting, make sure you have:

- A Cloudflare account.
- A GitHub account with access to `Ryan-PG/RyTy`.
- Node.js 22 installed locally.
- npm installed.
- A domain managed by Cloudflare (optional, but recommended).

### Verify Node.js

Open PowerShell:

```powershell
node --version
npm --version
```

Make sure Node.js 22 is available.

### Clone the Repository

```powershell
git clone https://github.com/Ryan-PG/RyTy.git
cd RyTy
```

Install dependencies:

```powershell
npm install
```

---

## 3. Connect Wrangler to Cloudflare

Wrangler is the Cloudflare CLI used to manage Workers, D1 databases, Secrets, and deployments.

Install it through the project's dependencies or use `npx`.

Authenticate:

```powershell
npx wrangler login
```

A browser window opens. Sign in to Cloudflare and authorize Wrangler.

Verify authentication:

```powershell
npx wrangler whoami
```

If your Cloudflare account is displayed, authentication is successful.

---

## 4. Create the Cloudflare D1 Database

RyTy uses Cloudflare D1 as its production database.

### 4.1. Create the Database

Run:

```powershell
npx wrangler d1 create ryty
```

Cloudflare returns database information similar to:

```text
database_name = "ryty"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Copy the actual `database_id`.

### 4.2. Configure wrangler.jsonc

Open the project configuration:

```powershell
vim wrangler.jsonc
```

Find the D1 configuration:

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "ryty",
      "database_id": "YOUR_DATABASE_ID",
      "migrations_dir": "migrations",
    },
  ],
}
```

Replace `YOUR_DATABASE_ID` with the actual ID returned by Cloudflare.

Important:

- Keep the binding name as `DB`.
- Keep the database name as `ryty`.
- Keep the migrations directory as `migrations`.
- Do not replace the database ID with the database name.

Save the file.

### 4.3. Verify Database Configuration

Run:

```powershell
npx wrangler d1 list
```

Make sure the `ryty` database exists.

---

## 5. Apply Database Migrations

Creating a D1 database does not automatically create application tables.

RyTy uses migration files to create and update the database schema.

### 5.1. Check Migration Files

From the repository root:

```powershell
Get-ChildItem .\migrations\*.sql
```

Make sure the migration files are present.

### 5.2. Check Migration Status

```powershell
npx wrangler d1 migrations list ryty --remote
```

This checks the migration state of the remote D1 database.

### 5.3. Apply Migrations

```powershell
npx wrangler d1 migrations apply ryty --remote
```

Confirm the operation if Wrangler asks for confirmation.

Important:

- Use `--remote` for the production Cloudflare database.
- Local migrations do not automatically update the remote database.
- Run migrations before deploying application versions that depend on new schema changes.
- Do not blindly recreate the database if migrations fail. Inspect the error first.

---

## 6. Configure Cloudflare Environment Variables

RyTy reads its Cloudflare configuration through the Worker environment.

The current configuration supports:

| Variable                 | Type     | Description                    |
| ------------------------ | -------- | ------------------------------ |
| `INITIAL_ADMIN_USERNAME` | Variable | Initial administrator username |
| `INITIAL_ADMIN_PASSWORD` | Secret   | Initial administrator password |
| `APP_TIMEZONE`           | Variable | Application timezone           |
| `DEFAULT_LANGUAGE`       | Variable | Default application language   |

### 6.1. Configure Public Variables

The `wrangler.jsonc` configuration contains the following default values:

```jsonc
{
  "vars": {
    "APP_TIMEZONE": "UTC",
    "DEFAULT_LANGUAGE": "en",
    "INITIAL_ADMIN_USERNAME": "admin",
  },
}
```

These are non-sensitive configuration values.

You can change them according to your deployment requirements.

For example:

```jsonc
{
  "vars": {
    "APP_TIMEZONE": "Asia/Baku",
    "DEFAULT_LANGUAGE": "en",
    "INITIAL_ADMIN_USERNAME": "admin",
  },
}
```

Use a valid IANA timezone identifier.

### 6.2. Configure the Initial Admin Password

The initial administrator password must never be committed to GitHub.

Use Cloudflare Secrets:

```powershell
npx wrangler secret put INITIAL_ADMIN_PASSWORD
```

Wrangler asks you to enter the secret value.

Enter your desired initial administrator password.

The value is stored as a Worker Secret and is not exposed in the repository.

**Important:**

Do not:

- Put the password in `wrangler.jsonc`.
- Put the production password in `.env` and commit it.
- Add the password to GitHub Actions or repository files as plain text.
- Hash the password manually before registering the Secret.

The application hashes the password when creating the administrator account.

---

## 7. Initial Administrator Bootstrap

RyTy supports creating the initial administrator through the login endpoint.

This process is important because registering a Cloudflare Secret alone does not create a user account.

### 7.1. Bootstrap Logic

The current implementation follows this process:

1. A user submits a login request.
2. The backend checks the number of active administrators.
3. If no active administrator exists, it checks whether `INITIAL_ADMIN_PASSWORD` is configured.
4. It compares the submitted username and password with the configured bootstrap credentials.
5. If both match, it creates the initial administrator.
6. The password is hashed using PBKDF2-SHA256 with a random salt.
7. The password hash is stored in D1.
8. The administrator is created with `mustChangePassword = true`.
9. The login process continues and verifies the newly created account.

### 7.2. Initial Login

Open the deployed application.

Use:

```text
Username: admin
Password: Your INITIAL_ADMIN_PASSWORD value
```

The username is configurable through `INITIAL_ADMIN_USERNAME`. If it is not configured, the default is `admin`.

### 7.3. Mandatory Password Change

The initial administrator must change the password after logging in.

The application uses the following behavior:

- Initial password is used only for the bootstrap process.
- The new password is hashed before being stored.
- `mustChangePassword` becomes `false`.
- The new password is used for subsequent logins.

### 7.4. Important Bootstrap Notes

The initial password Secret is not automatically deleted after account creation.

However, the application checks whether an active administrator already exists before attempting bootstrap.

The bootstrap process also refuses to create an account if the configured username already belongs to an existing account.

If an administrator already exists, changing the Cloudflare Secret does not reset that administrator's password.

For password recovery, use the application's administrator password reset functionality.

---

## 8. First Manual Deployment

Before configuring automatic GitHub deployments, you can deploy the application manually.

The project already provides a deployment script.

### 8.1. Build and Deploy

Run:

```powershell
npm run deploy
```

This executes:

```text
npm run build:client
wrangler deploy
```

Wrangler uploads the Worker and its configured assets to Cloudflare.

### 8.2. Deployment URL

After a successful deployment, Cloudflare provides a URL similar to:

```text
https://ryty.<your-cloudflare-subdomain>.workers.dev
```

Open this URL to verify the application.

### 8.3. Verify API Health

Open:

```text
https://ryty.<your-cloudflare-subdomain>.workers.dev/api/health
```

Expected response:

```json
{
  "data": {
    "status": "ok",
    "database": "ok"
  }
}
```

This confirms that the Worker can access the database.

---

## 9. Connect GitHub to Cloudflare

Once the initial infrastructure is configured, GitHub can manage future deployments.

This replaces the need to run manual deployments for every code change.

### 9.1. Open Cloudflare Dashboard

Navigate to:

```text
Cloudflare Dashboard
    → Workers & Pages
```

Choose the Git integration / Workers Builds workflow.

### 9.2. Connect GitHub

1. Select GitHub as the source provider.
2. Authorize Cloudflare to access your GitHub account.
3. Select the repository:

```text
Ryan-PG/RyTy
```

4. Select the production branch:

```text
main
```

### 9.3. Configure Build Settings

Use the following configuration:

| Setting           | Value                 |
| ----------------- | --------------------- |
| Worker name       | `ryty`                |
| Production branch | `main`                |
| Root directory    | `/`                   |
| Install command   | `npm ci`              |
| Build command     | `npm run build`       |
| Deploy command    | `npx wrangler deploy` |
| Node.js version   | `22`                  |

These settings follow the project's existing build configuration and deployment structure.

### 9.4. Important: Existing Worker and Database

The GitHub deployment must use the existing Worker configuration.

Make sure:

- The Worker name remains `ryty`.
- The same `wrangler.jsonc` is used.
- The existing D1 database ID is preserved.
- The D1 binding remains `DB`.
- The existing Secrets are configured for the production Worker.

Do not create an unrelated production database or change the database ID during GitHub integration.

If the dashboard workflow creates a new Worker instead of connecting the existing deployment, stop and verify the resource configuration before proceeding.

### 9.5. Configure Production Secrets

Check the Worker environment after connecting GitHub.

Make sure the production Worker has:

```text
INITIAL_ADMIN_PASSWORD
```

configured as a Secret.

Also verify the required public variables:

```text
INITIAL_ADMIN_USERNAME
APP_TIMEZONE
DEFAULT_LANGUAGE
```

Do not assume that connecting GitHub automatically transfers the existing Worker configuration.

---

## 10. Automatic Deployment Workflow

After GitHub integration is configured, the deployment process becomes:

```text
Developer
    |
    | git push origin main
    v
GitHub Repository
    |
    | Push event
    v
Cloudflare Workers Builds
    |
    | Install dependencies
    v
npm ci
    |
    | Build
    v
npm run build
    |
    | Deploy
    v
npx wrangler deploy
    |
    v
Production Worker
```

### 10.1. Deploy New Changes

From your local project:

```powershell
git add .
git commit -m "Update application"
git push origin main
```

Cloudflare detects the push and starts a new deployment.

### 10.2. Monitor Deployment

Navigate to:

```text
Cloudflare Dashboard
    → Workers & Pages
    → ryty
    → Deployments
```

Check:

- Build status.
- Deployment status.
- Build logs.
- Deployment errors.

### 10.3. Manual Deployment Is No Longer Required

After GitHub integration is working, normal application updates should be deployed through GitHub.

You do not need to run:

```powershell
npm run deploy
```

for every code change.

Keep Wrangler installed locally for database management, migrations, debugging, and administrative operations.

---

## 11. Configure a Custom Domain

Cloudflare provides a default `workers.dev` URL.

For production, a custom domain is recommended.

Example:

```text
ryty.ryanheida.com
```

### 11.1. Add the Custom Domain

Navigate to:

```text
Cloudflare Dashboard
    → Workers & Pages
    → ryty
    → Settings
    → Domains & Routes
    → Add
    → Custom Domain
```

Enter:

```text
ryty.ryanheida.com
```

Cloudflare manages the required DNS configuration and provisions the SSL certificate.

### 11.2. Important Requirements

- The domain's DNS zone must be active in the same Cloudflare account.
- The custom domain must be attached to the intended Worker.
- Wait for DNS and SSL provisioning to finish.

### 11.3. Verify the Domain

Open:

```text
https://ryty.ryanheida.com
```

Check:

```text
https://ryty.ryanheida.com/api/health
```

The application should work over HTTPS.

---

## 12. Production Verification Checklist

After deployment, verify the following functionality.

### Infrastructure

- [ ] Worker `ryty` is deployed.
- [ ] Workers Assets serves the frontend.
- [ ] D1 database is accessible.
- [ ] Database migrations are applied.
- [ ] Production Secrets are configured.
- [ ] Custom domain works.
- [ ] HTTPS works correctly.

### Authentication

- [ ] Setup status endpoint works.
- [ ] Initial administrator can be created.
- [ ] Initial login works.
- [ ] Mandatory password change works.
- [ ] New password works after changing it.
- [ ] Invalid credentials are rejected.
- [ ] Inactive users cannot log in.

### Application

- [ ] Dashboard loads.
- [ ] User management works.
- [ ] Project management works.
- [ ] Timer starts and stops correctly.
- [ ] Manual activity entries work.
- [ ] Reports load correctly.
- [ ] CSV export works.
- [ ] User preferences persist.
- [ ] Persian and English interfaces work.
- [ ] Data persists after redeployment.

### Security

- [ ] Initial password is not committed to GitHub.
- [ ] Password hashes are stored instead of plaintext passwords.
- [ ] Authentication is enforced by the backend.
- [ ] Admin endpoints require administrator privileges.
- [ ] Password changes revoke other sessions.
- [ ] Login rate limiting works.

---

## 13. Useful Cloudflare Commands

All commands below are intended to run from the repository root.

### Authentication

```powershell
npx wrangler login
npx wrangler whoami
```

### Database Management

List databases:

```powershell
npx wrangler d1 list
```

Check migrations:

```powershell
npx wrangler d1 migrations list ryty --remote
```

Apply migrations:

```powershell
npx wrangler d1 migrations apply ryty --remote
```

### Inspect Database Tables

```powershell
npx wrangler d1 execute ryty --remote --command "SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name;"
```

### Update Initial Admin Secret

```powershell
npx wrangler secret put INITIAL_ADMIN_PASSWORD
```

Remember: updating this Secret does not reset an existing administrator's password.

### Deploy Manually

```powershell
npm run deploy
```

### Inspect Wrangler Version

```powershell
npx wrangler --version
```

---

## 14. Database Backup

D1 supports database export.

Create a backup:

```powershell
npx wrangler d1 export ryty --remote --output=./ryty-backup.sql
```

The resulting file:

```text
ryty-backup.sql
```

contains database data.

Important:

- Never commit production database backups to GitHub.
- Keep backups in a secure location.
- Restrict access to backup files.
- Test restoration procedures before relying on backups.

For a production system, establish a regular backup strategy instead of relying on manual exports.

---

## 15. Database Migrations During Future Updates

Database migrations are separate from application deployment.

A GitHub push does not automatically apply D1 migrations unless an explicit migration step has been configured.

For a release that changes the database schema, use this sequence:

```text
1. Review migration files
          |
          v
2. Back up production database
          |
          v
3. Apply D1 migrations
          |
          v
4. Deploy application through GitHub
          |
          v
5. Verify production application
```

Apply migrations using:

```powershell
npx wrangler d1 migrations apply ryty --remote
```

Do not assume that a successful Worker deployment means the database schema is up to date.

For production schema changes, prefer backward-compatible migrations so that the currently deployed application can continue working during the deployment process.

---

## 16. Troubleshooting

### Problem: Database is unavailable

Check:

- `database_id` in `wrangler.jsonc`.
- D1 binding name.
- Database existence.
- Migration status.
- Worker deployment logs.

### Problem: Initial Admin Login Fails

Open:

```text
https://ryty.ryanheida.com/api/setup/status
```

Inspect the response.

Relevant fields:

| Field                 | Meaning                                   |
| --------------------- | ----------------------------------------- |
| `adminExists`         | Whether an active administrator exists    |
| `bootstrapConfigured` | Whether an initial password is configured |
| `bootstrapUsername`   | Configured initial administrator username |

Possible causes:

- The Secret is missing from the production Worker.
- The submitted username does not match the configured username.
- The submitted password does not match the Secret.
- An active administrator already exists.
- An existing account already uses the configured bootstrap username.

The setup endpoint does not expose the password or its hash.

### Problem: GitHub Deployment Fails

Check:

- Node.js version is 22.
- Install command is `npm ci`.
- Build command is `npm run build`.
- Deploy command is `npx wrangler deploy`.
- The repository root directory is correct.
- `wrangler.jsonc` is present.
- The D1 database ID is valid.

Inspect the Cloudflare build logs for the exact error.

### Problem: Custom Domain Does Not Work

Check:

- The domain is active in Cloudflare.
- The custom domain is attached to Worker `ryty`.
- DNS provisioning is complete.
- SSL certificate provisioning is complete.

---

## 17. Final Production Architecture

The intended production configuration is:

| Resource               | Configuration             |
| ---------------------- | ------------------------- |
| Source Repository      | `Ryan-PG/RyTy`            |
| Production Branch      | `main`                    |
| Cloudflare Worker      | `ryty`                    |
| Frontend               | Workers Assets            |
| Backend                | Hono on Workers           |
| Database               | Cloudflare D1             |
| Database Binding       | `DB`                      |
| Database Name          | `ryty`                    |
| Build System           | Cloudflare Workers Builds |
| Deployment Trigger     | Push to `main`            |
| Runtime                | Cloudflare Workers        |
| Custom Domain          | `ryty.ryanheida.com`      |
| Initial Admin Username | `admin` by default        |
| Initial Admin Password | Cloudflare Secret         |

### Deployment Responsibilities

| Task                    | Where                     |
| ----------------------- | ------------------------- |
| Application development | Local machine             |
| Source control          | GitHub                    |
| Application build       | Cloudflare Workers Builds |
| Application deployment  | Cloudflare Workers        |
| Database storage        | Cloudflare D1             |
| Database migrations     | Wrangler CLI              |
| Secret management       | Cloudflare                |
| DNS and SSL             | Cloudflare                |
| Production monitoring   | Cloudflare Dashboard      |

---

## 18. Important Operational Rules

1. Never commit production passwords or Secrets to GitHub.
2. Never replace the production D1 database ID accidentally.
3. Never recreate the production database just to fix a deployment issue.
4. Always inspect migrations before applying them to production.
5. Apply required database migrations before deploying code that depends on them.
6. Use GitHub as the primary deployment source after integration.
7. Keep manual Wrangler deployment available for controlled maintenance.
8. Keep production backups outside the Git repository.
9. Do not assume that changing the initial admin Secret resets an existing account.
10. Verify production health after every deployment.

---

**Deployment model:** GitHub → Cloudflare Workers Builds → Cloudflare Worker + Workers Assets → Cloudflare D1.

This architecture keeps the application, API, and database on Cloudflare while using GitHub as the source of truth for application code.
