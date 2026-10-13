# Thread — no complaint left hanging

**Live demo:** https://v4-catalyst.vercel.app  ·  sign in with a demo account below

When a customer complaint changes hands — someone goes on leave, a case is escalated, a team rebalances work — the
context usually gets lost, and the customer has to explain everything again. **Thread makes a handover impossible to
do badly:** a case can only be forwarded once it is complete, and the receiver has to confirm they understood it before
they own it. Every step is on the record.

## What it does

- **Completeness gate.** Forwarding a case runs 8 checks — receiver chosen, reason given, handover note written, key
  decisions recorded, documents attached, every open task assigned *and* dated, no unanswered questions. A failing check
  blocks the forward and links straight to where it gets fixed. The server re-runs the check; the browser can't skip it.
- **Accountable acceptance.** The receiver acknowledges five sections (summary, context and decisions, documents, actions,
  questions) and can ask the sender questions. Ownership only transfers when all five are acknowledged and every question
  is answered — or they send it back with a reason.
- **Handover assistant, computed from the record.** *Auto-draft from record* writes the handover note and lists what to do
  first, the risks and the gaps; *Brief me* tells the receiver what they're taking on and what to ask before accepting.
  It runs on the server from the case's own notes, decisions, tasks and questions: no external AI service, no API key.
- **Alerts and escalation.** Overdue tasks, deadlines inside 24h, forwards waiting too long, unanswered questions. Reminders
  go out automatically and anything 48h overdue is escalated to every administrator.
- **Management reports, generated in Python.** Weekly, monthly and annual reports as a proper document — complaints
  registered and closed (with the full list of each), key metrics against the previous period (like for like while a
  period is in progress), backlog trend, resolution times, handover acceptance, team activity, open risks and a
  definitions appendix. Downloadable PDF and CSV; report downloads are tracked as a metric.
- **Audit trail and access control.** Every action is logged append-only; employees only see cases they're connected to;
  admins and auditors see everything; refused access is logged too.

## Try it (3 minutes)

1. Sign in as **Asha Rao** → open **CMP-1042** → **Forward case**. The completeness check blocks it with 6 failing items.
   Follow each *fix →* link, then use **Auto-draft from record** for the note, and submit.
2. Sign in as **Ravi Menon** → open the forward → **Brief me** → acknowledge the five sections → **Accept**.
3. Sign in as **Meera Iyer** (admin) → **Alerts** (the critical CCTV task) → **Reports** → *Weekly* → *Download PDF* → **Audit log**.

| Demo account (username / password) | Role |
|---|---|
| `asha.rao` / `Asha@2026` · `ravi.menon` / `Ravi@2026` · `neha.kulkarni` / `Neha@2026` · `karan.joshi` / `Karan@2026` | Employees |
| `meera.iyer` / `Meera@Admin26` · `arjun.shah` / `Arjun@Admin26` | Admins |

## How it's built

```
React + TypeScript (Vite)  ──HTTPS/JSON──▶  FastAPI (Python)  ──▶  PostgreSQL (SQLite locally)
  Vercel                                      Render                 Neon
  three.js login scene                        rules · audit · alerts · reports (reportlab, matplotlib) · assistant
```

- **Business rules live on the server** (completeness gate, stage moves, acceptance, visibility, lockout after 5 failed
  sign-ins), mirrored in the browser only for instant feedback.
- **Alembic migrations** run on startup; **35 automated tests** cover the full handover flow, every error code,
  migrations on SQLite and PostgreSQL, alerts, reports and the handover assistant.
- Details: [backend/README.md](backend/README.md) · API contract: [frontend/API_CONTRACT.md](frontend/API_CONTRACT.md)

## Run it locally

```bash
python run_app.py        # installs what's missing, starts API (:8080) and app (:5173)
```

Optional: set `SEED_HISTORY=true` in `backend/.env` to load 21 months of history for the reports.
