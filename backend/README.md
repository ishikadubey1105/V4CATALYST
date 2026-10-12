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

## Test

```bash
python -m pytest -q
```

The suite runs the README demo script end to end (blocked forward → fix gaps → submit → ack → accept) plus every
error code in the contract, against a throwaway database.

## Layout

| File | What it does |
|---|---|
| `app/main.py` | App, CORS, `{code, message}` error handlers, startup (create tables, seed, deadline loop) |
| `app/routers/*.py` | One module per area: `auth`, `sync`, `cases` (+ tasks, notes, decisions, documents, questions), `handoffs`, `notifications`, `employees` |
| `app/rules.py` | Port of `permissions.ts` + `completeness.ts`: case roles, visibility, stage rules, 8-check gate |
| `app/models.py` | SQLAlchemy tables |
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
- **Database**: set `DATABASE_URL` to any SQLAlchemy URL (e.g. Postgres + the `psycopg` driver). Tables are created on
  startup; add Alembic before the schema starts changing in production.
- Handoff **drafts** stay client-side (as in the frontend); only the submit goes to the server.
