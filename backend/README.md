# Baton — backend (Python / FastAPI)

Implements every route in [`../frontend/API_CONTRACT.md`](../frontend/API_CONTRACT.md) and enforces the same rules as the
frontend's mock adapter, on the server: completeness gate, stage rules, 5-ack accept, login lockout, per-case
visibility, audit trail, notifications and the deadline watcher.

## Run

```bash
cd backend
python -m venv .venv && .venv\Scripts\activate      # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env                               # optional; defaults work as-is
uvicorn app.main:app --reload --port 8080
```

- API: `http://localhost:8080/api` · interactive docs: `http://localhost:8080/api/docs`
- On first start an empty database is created (`baton.db`, SQLite) and seeded with the demo accounts and cases
  from the frontend README (`asha.rao` / `Asha@2026`, `meera.iyer` / `Meera@Admin26`, …). Delete `baton.db` to reset.

Then point the frontend at it (in `frontend/.env.local`) and run `npm run dev`:

```
VITE_API_MODE=http
VITE_API_BASE_URL=http://localhost:8080/api
```

## Database

SQLite (`backend/baton.db`) is the zero-setup default. **PostgreSQL** is supported for deployment: set
`DATABASE_URL` to the URL your host gives you (Render, Neon, Supabase, Railway…) — `postgres://` URLs are accepted
as-is; add `?sslmode=require` if the host needs SSL.

The schema is managed by **Alembic** migrations (`migrations/versions/`). They run automatically on every startup,
so deploying new code also updates the database. A database created before migrations existed is detected and
adopted without touching its data.

| Command (run in `backend/`) | What it does |
|---|---|
| `python manage.py status` | Which database, schema revision, row counts |
| `python manage.py migrate` | Apply pending migrations (startup does this too) |
| `python manage.py seed` | Load the demo data into an empty database |
| `python manage.py create-admin USER "Name" EMAIL` | First admin for a real deployment (`SEED_DEMO=false`); prints a one-time password |
| `python manage.py reset --yes` | **Deletes everything**, re-creates the schema, reloads the demo data |

**Changing the schema:** edit `app/models.py`, then
`python -m alembic revision --autogenerate -m "what changed"`, review the generated file in `migrations/versions/`,
and commit it. `tests/test_migrations.py` fails if a model changes without a migration.

Models declare foreign keys without ORM `relationship()`s, so SQLAlchemy does not order inserts parent-first:
when one request creates a parent row and a row pointing at it, `db.flush()` after adding the parent
(see `create_case`). Foreign keys are enforced on SQLite too, so tests catch this before Postgres does.

## Test

```bash
python -m pytest -q                                                    # SQLite, throwaway file
TEST_DATABASE_URL=postgresql://user:pass@localhost/baton_test python -m pytest -q   # PostgreSQL (wipes that DB)
```

The suite builds its schema through the migrations, runs the README demo script end to end (blocked forward →
fix gaps → submit → ack → accept), every error code in the contract, and migration checks (models match
migrations, legacy-database adoption, downgrade/upgrade round trip).

## Layout

| File | What it does |
|---|---|
| `app/main.py` | App, CORS, `{code, message}` error handlers, startup (create tables, seed, deadline loop) |
| `app/routers/*.py` | One module per area: `auth`, `sync`, `cases` (+ tasks, notes, decisions, documents, questions), `handoffs`, `notifications`, `employees` |
| `app/rules.py` | Port of `permissions.ts` + `completeness.ts`: case roles, visibility, stage rules, 8-check gate |
| `app/models.py` | SQLAlchemy tables |
| `app/migrate.py`, `migrations/` | Alembic setup and migration scripts |
| `manage.py` | Database admin commands (status, migrate, seed, create-admin, reset) |
| `app/serializers.py` | Rows → camelCase JSON matching `frontend/src/lib/types.ts` |
| `app/schemas.py` | Request DTOs (Pydantic) matching `contracts.ts` |
| `app/deadlines.py` | Overdue-task watcher (runs every `DEADLINE_INTERVAL_SECONDS`) |
| `app/seed.py` | Demo data, same as `frontend/src/data/mock.ts` |

## Notes

- **Auth**: opaque bearer tokens stored as SHA-256 hashes in `sessions`; passwords are PBKDF2-SHA256. Logout and
  disabling an account revoke sessions. Tokens expire after `SESSION_TTL_HOURS`.
- **`GET /sync`** also returns `failedLogins` (admins only) — the admin console reads it to show and clear locks.
  "Unlock" sends `PATCH /employees/:id {active: true}`, which resets the counter.
- **`PATCH /tasks/:id`**: `null` for `ownerId` / `due` clears the field.
- **Extra routes** beyond the contract: `GET /cases/:id` (logs `access.denied` when refused),
  `GET /documents/:id/download` (uploaded files are stored under `UPLOAD_DIR`), `GET /health`.
- Handoff **drafts** stay client-side (as in the frontend); only the submit goes to the server.
