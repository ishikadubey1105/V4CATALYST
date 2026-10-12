# Baton — complaint handoff console (frontend)

Interactive prototype. In the default **mock** mode an in-browser backend (`src/api/mock.ts` over a
persisted Zustand store) enforces the same rules the real server will. Every screen talks only to
`api.*` (`src/api/index.ts`), so switching to the real backend is configuration, not a rewrite.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build (vercel.json handles SPA routes)
```

## Accounts

Only provisioned accounts can sign in; any other username is rejected with **"Invalid user"**.
5 wrong passwords lock the account until an admin unlocks it.

| Username | Password | Access |
|---|---|---|
| `asha.rao` | `Asha@2026` | Employee |
| `ravi.menon` | `Ravi@2026` | Employee |
| `neha.kulkarni` | `Neha@2026` | Employee |
| `karan.joshi` | `Karan@2026` | Employee |
| `meera.iyer` | `Meera@Admin26` | Admin |
| `arjun.shah` | `Arjun@Admin26` | Admin |

These live only in the mock credential table (`src/data/mock.ts`). In production the backend issues
credentials; admins create further accounts in the Admin console (a one-time password is shown once).

## Connecting the backend

1. Implement the routes in [API_CONTRACT.md](API_CONTRACT.md) (source of truth: `src/api/contracts.ts`).
2. Copy `.env.example` to `.env.local` and set `VITE_API_MODE=http`, `VITE_API_BASE_URL=…`.
3. Nothing in `src/pages` changes: `src/api/http.ts` implements the same `Api` interface as the mock.

```
UI component ──▶ api.method()  (src/api/index.ts)
                   ├─ mock.ts  → in-browser rules + store          (VITE_API_MODE=mock)
                   └─ http.ts  → request(endpoints.x) → GET /sync  (VITE_API_MODE=http)
```

## Access model

- Every profile is an employee. Owner / incoming receiver / task assignee / previous owner is derived per
  case from the records (`caseRole` in `src/lib/permissions.ts`), never stored on the profile.
- Organisation-wide access level: `employee`, `admin`, `auditor` (read-only; can be created by an admin).
- Employees only see cases they are connected to; other cases return 403 and are logged.

## Workflow views

- **Workflow › Process flow**: n8n-style node graph of the complaint lifecycle with live counts and IF gates
  (completeness check, accept/reject), loops (fix gaps, reject → sender, Q&A) and the deadline watcher.
  Click a node to inspect what is currently at that step.
- **Workflow › Task timeline**: every task placed on a day axis by its deadline, one lane per case,
  chained in due order; overdue / due-soon / done / no-deadline are colour-coded. Also on each case as
  the **Timeline flow** tab.
- **Pipeline board**: drag cases between the five numbered stages.

## Where each part lives

| Part | File |
|---|---|
| API contract / adapters / client | `src/api/contracts.ts`, `mock.ts`, `http.ts`, `client.ts` |
| Mock database + seed data | `src/store/useStore.ts`, `src/data/mock.ts` |
| Roles, visibility, stage rules | `src/lib/permissions.ts` |
| Completeness gate (8 checks) | `src/lib/completeness.ts` |
| Node canvas | `src/components/FlowCanvas.tsx` |
| Process flow + task timeline | `src/components/flows.tsx`, `src/pages/Flow.tsx` |
| Screens | `src/pages/*.tsx` |
| Theme (Nardo grey) + design system | `src/index.css`, `src/components/ui.tsx` |

## Demo script

1. Try `someone.else` → **Invalid user**. Sign in as `asha.rao`.
2. CMP-1042 → *Forward case* → pick Ravi + reason → note → check is **blocked**; follow each *fix →* link, submit.
3. Sign in as `ravi.menon` → review → acknowledge 5 sections → accept. Workflow › Process flow shows the counts move.
4. Workflow › Task timeline: overdue CMP-1019 tasks sit left of TODAY in red.
5. Sign in as `meera.iyer` → Admin console → responsibility matrix, API integration tab; reassign a case with a reason.
