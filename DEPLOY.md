# Deploying Thread on Vercel (frontend + backend in one project)

This branch (`vercel-deploy`) deploys the whole app to a single Vercel project:

| Part | How Vercel runs it |
|---|---|
| React app (`frontend/`) | Built with `npm run build`, served as static files from `frontend/dist` |
| FastAPI backend (`backend/`) | One Python serverless function, `api/index.py`; every `/api/*` request is routed to it |
| Database | PostgreSQL (Neon or Supabase from the Vercel Marketplace). Required: a serverless function has no lasting disk |
| Deadline watcher | Vercel Cron calls `/api/cron/deadlines` daily, and every signed-in browser's alert poll runs it at most once a minute |
| Uploaded documents | Stored in the database (no disk needed); 4 MB per file, under Vercel's 4.5 MB request limit |
| Reports (PDF / CSV) | Generated in the function with reportlab + matplotlib; no external service, no API key |

The app and API share one domain, so there is no CORS setup and preview deployments work too.

> This is a **separate deployment** from the one already running from the `frontend` branch (Vercel + Render).
> Use a **new Vercel project** and a **new database**, so the two versions never share data or migrations.

## 1. Create the Vercel project

1. vercel.com → **Add New… → Project** → import `ishikadubey1105/V4CATALYST`.
2. **Root Directory: leave it as the repository root** (`./`), not `frontend`. Framework preset: **Other**.
   Build settings come from `vercel.json`; don't override them.
3. **Production Branch**: Project → Settings → Git → set it to `vercel-deploy`.

## 2. Add a PostgreSQL database

Project → **Storage → Create Database → Neon** (free tier is enough), connect it to the project for all
environments. This sets `DATABASE_URL` / `POSTGRES_URL`; the backend reads either.
Prefer the **pooled** connection string (host contains `-pooler`) for `DATABASE_URL`: serverless opens a connection
per request.

## 3. Environment variables

Project → Settings → **Environment Variables**:

| Name | Value | Why |
|---|---|---|
| `DATABASE_URL` | set by the Neon integration (pooled URL) | Required. Without it every API call answers `503 DATABASE_NOT_CONFIGURED` |
| `CRON_SECRET` | any long random string | Lets Vercel Cron run the deadline watcher; Vercel sends it automatically |
| `SEED_DEMO` | `true` for a demo, `false` for real use | Loads the demo accounts and cases into an empty database |

Nothing else is needed: no AI or other API keys. Optional: `SESSION_TTL_HOURS`, the `ALERT_*` thresholds
(see `backend/app/config.py`).

## 4. Deploy

Push the branch (or click **Redeploy**). On the first request the backend applies the database migrations and,
with `SEED_DEMO=true`, loads the demo data. Then:

- App: `https://<project>.vercel.app` — demo sign-in e.g. `meera.iyer` / `Meera@Admin26` (admin)
- API docs: `https://<project>.vercel.app/api/docs`
- Health: `https://<project>.vercel.app/api/health` → `{"ok": true}`

For a real deployment: `SEED_DEMO=false`, then create the first admin from your machine against the same database:

```bash
cd backend
DATABASE_URL="postgresql://…" python manage.py create-admin USER "Full Name" EMAIL   # prints a one-time password
```

## Notes and limits

- **Cold starts**: the first request after a quiet period takes a few seconds (Python + matplotlib load). Reports
  can take a few more seconds; the function may run up to 60 s.
- **Cron on the Hobby plan** runs at most once a day (`vercel.json` → `crons`). Overdue notices still go out within
  a minute while anyone has the app open, because the alert poll runs the watcher too. On Pro you can make the
  schedule more frequent, e.g. `*/15 * * * *`.
- **Several instances at once**: migrations and the watcher take a Postgres advisory lock, so only one instance
  migrates or sends reminders at a time.
- **Times**: weekly reports use ISO weeks in UTC (Monday 05:30 IST to Monday 05:30 IST).

## Running locally

Unchanged: `python run_app.py` from the repository root (SQLite, no setup). Tests: `cd backend && python -m pytest -q`.
