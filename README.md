# Relay

**A handoff is not a button. It is a transaction the system is allowed to refuse.**

Relay is a handoff and continuity platform (Hackathon PS 3). Before a case changes hands, a readiness gate inspects it for missing context, unowned work and undocumented decisions, and refuses the transfer until they are fixed or explicitly disclosed. Every action lands in a hash-chained, tamper-evident history.

## Run it

```bash
npm install          # also runs prisma generate
cp .env.example .env # then fill SESSION_SECRET and CRON_SECRET (see below)
npm run db:reset     # create the SQLite database and load the demo data
npm run dev          # http://localhost:3000
```

Generate secrets with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

| Command | What it does |
| --- | --- |
| `npm test` | Unit tests for the gate engine and the hash chain |
| `npm run db:reset` | Wipe and reload the demo data. Run before every rehearsal. |
| `npm run test:api -- http://localhost:3000` | 47 checks through the API, including attack tests and tampering with the database. Run `npm run db:reset` afterwards. |
| `npm run test:ui -- http://localhost:3000` | Drives a real browser through the whole demo as all five roles and a phone, with screenshots. Needs `npx playwright install chromium` once. Run `npm run db:reset` afterwards. |
| `npm run typecheck` / `npm run lint` | Static checks |

## Demo accounts

Password for all: `relay-demo`. The login page has one-click buttons.

| Email | Role | Story |
| --- | --- | --- |
| priya@relay.demo | Member | Owns the Acme case, on leave tomorrow |
| rahul@relay.demo | Member | Receives it |
| anjali@relay.demo | Manager | Team lead, can force-reassign |
| auditor@relay.demo | Auditor | Read-only, verifies history |
| admin@relay.demo | Admin | Edits gate policy |

## Demo script (5 minutes)

1. **Priya** → dashboard. Acme shows 2 overdue actions and a red readiness bar.
2. Open **Acme Corp — billing dispute escalation**. Show the context, decisions and documents tabs.
3. **Hand off case** → Rahul → reason → **Check readiness**. Gate: **58%, 3 blockers, 2 warnings. Submit is locked.**
4. Click each blocker. It lands on the exact field:
   - Decision with no rationale → type one, save.
   - In-progress credit note still assigned to Priya → reassign to Rahul.
   - No invoice on a billing dispute → upload `demo-files/acme-invoice-INV-2291.pdf` as *Invoice*.
   The sticky banner shows the score climbing; **Back to handoff**.
5. Waive both warnings with a written justification. Submit.
6. Sign in as **Rahul** → *Waiting for you* → the context package: what to know, pending actions, decisions with rationale, **known gaps disclosed by the sender**. Accept.
7. Sign in as the **Auditor** → Acme → *Ownership*: who owned it when, every waiver. *Activity* → **Verify integrity** → green.
8. **Tamper**: run `npx prisma studio`, open `ActivityLog`, edit any `payloadJson` on the Acme case, save. Back in the app → **Verify integrity** → red, names the entry.

Close: *"Every handoff tool transfers ownership. Ours is the only one that can refuse."*

## How it works

**Readiness gate** (`src/lib/gate.ts`) is a pure function over a loaded case: 7 blocker rules and 5 warning rules, stored as rows in `GateRule` so policy is data, not code. The score is weighted (blockers 3, warnings 1), but submission is gated on findings, not the score:
- any standing blocker → `409 BLOCKERS_STANDING`
- any warning neither fixed nor waived → `409 WARNINGS_UNADDRESSED`

The server re-runs the gate on submit; it never trusts the score the client saw.

**Snapshot and acknowledgement.** On submit, the case is frozen as canonical JSON and SHA-256 hashed. The recipient accepts *that hash*: a mismatch is refused. Nobody can later claim they were not told something that was in the package.

**Hash chain** (`src/lib/canon.ts`, `src/lib/audit.ts`). Every mutation appends an `ActivityLog` row in the same transaction: `hash_n = SHA256(hash_{n-1} | canonical(entry_n))`. The head hash is also stored on the case, so deleting the newest rows is caught too. There is no code path that updates or deletes a log row.

*Honest limit:* a hash chain detects tampering; it does not prevent it. Someone with database write access could rewrite an entry and every entry after it, and update the stored head. Closing that needs an external anchor for the head hash (an append-only store or a countersigning key the app server does not hold).

**Access control** is enforced server-side in `src/lib/authz.ts` on every route. Members see cases they own, owned, were part of a handoff on, or have work on; managers see their team; admins and auditors see everything; auditors cannot write. Cases you cannot see return 404, not 403.

Security design, controls and known limits: see [SECURITY.md](SECURITY.md).

## Convergence: Web + Cybersecurity + Cloud

| Pillar | What we built |
| --- | --- |
| Web | Role-specific dashboards, the handoff wizard, the receiver's context package, the auditor's responsibility ledger |
| Cybersecurity | Server-enforced RBAC on all routes, bcrypt passwords with timing-safe login, HTTP-only SameSite session cookies (signed JWT), Zod validation on every input, upload MIME allowlist and size cap, SHA-256 document fingerprints re-checked on download, tamper-evident hash-chained audit log, snapshot hashes on handoffs |
| Cloud | Managed Postgres (Neon), serverless deploy (Vercel), scheduled overdue sweep (Vercel Cron) |

## Deploying (Vercel + Neon)

1. In `prisma/schema.prisma`, change `provider = "sqlite"` to `provider = "postgresql"`.
2. Set `DATABASE_URL` (Neon connection string), `SESSION_SECRET`, `CRON_SECRET` in Vercel.
3. `npx prisma db push && npm run db:seed` against the Neon URL.
4. **File uploads:** Vercel's filesystem is read-only. Swap `saveFile` / `readStored` in `src/lib/storage.ts` for Vercel Blob (`@vercel/blob`) before deploying, or uploads will fail.
5. Optional: add a Vercel Cron hitting `/api/jobs/overdue-sweep` with `Authorization: Bearer $CRON_SECRET`.

## Layout

```
prisma/schema.prisma        data model (11 tables)
prisma/seed.ts              demo data, tuned so Acme opens at 58%
src/lib/gate.ts             readiness gate engine (+ gate.test.ts)
src/lib/canon.ts, audit.ts  canonical JSON, hash chain, verification (+ canon.test.ts)
src/lib/authz.ts            sessions and permission checks
src/app/api/**              API route handlers
src/app/(app)/**            pages: dashboard, case, handoff wizard, package, gate policy
scripts/demo-check.mjs      end-to-end rehearsal through the API
```
