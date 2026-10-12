# Thread — no complaint left hanging

**Live demo:** https://v4-catalyst.vercel.app  ·  sign in with one click as any demo employee

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
- **AI handover assistant** (LLM on Groq). *Draft with AI* writes the handover note from the case record and lists what to do
  first, the risks and the gaps; *Brief me* tells the receiver what they're taking on and what to ask before accepting.
  Every reply is schema-checked; without a key a template answers, so it never breaks.
- **Alerts and escalation.** Overdue tasks, deadlines inside 24h, forwards waiting too long, unanswered questions. Reminders
  go out automatically and anything 48h overdue is escalated to every administrator.
- **Management reports, generated in Python.** Monthly and annual reports as a proper document — key metrics against the
  previous period (like for like while a period is in progress), backlog trend, resolution times, handover acceptance,
  team activity, open risks and a definitions appendix. Downloadable PDF and CSV.
- **Audit trail and access control.** Every action is logged append-only; employees only see cases they're connected to;
  admins and auditors see everything; refused access is logged too.

## Try it (3 minutes)

1. Sign in as **Asha Rao** → open **CMP-1042** → **Forward case**. The completeness check blocks it with 6 failing items.
   Follow each *fix →* link, then use **Draft with AI** for the note, and submit.
2. Sign in as **Ravi Menon** → open the forward → **Brief me** → acknowledge the five sections → **Accept**.
3. Sign in as **Meera Iyer** (admin) → **Alerts** (the critical CCTV task) → **Reports** → *Download PDF* → **Audit log**.

| Demo account | Role |
|---|---|
| Asha Rao, Ravi Menon, Neha Kulkarni, Karan Joshi | Employees |
| Meera Iyer, Arjun Shah | Admins |

## How it's built

```
React + TypeScript (Vite)  ──HTTPS/JSON──▶  FastAPI (Python)  ──▶  PostgreSQL (SQLite locally)
  Vercel                                      Render                 Neon
  three.js login scene                        rules · audit · alerts · reports (reportlab, matplotlib) · Groq LLM
```

- **Business rules live on the server** (completeness gate, stage moves, acceptance, visibility, lockout after 5 failed
  sign-ins), mirrored in the browser only for instant feedback.
- **Alembic migrations** run on startup; **35 automated tests** cover the full handover flow, every error code,
  migrations on SQLite and PostgreSQL, alerts, reports and the AI path.
- Details: [backend/README.md](backend/README.md) · API contract: [frontend/API_CONTRACT.md](frontend/API_CONTRACT.md)

## Run it locally

```bash
python run_app.py        # installs what's missing, starts API (:8080) and app (:5173)
```

Optional: put `GROQ_API_KEY=...` in `backend/.env` for the AI assistant, and set `SEED_HISTORY=true` there to load
21 months of history for the reports.
