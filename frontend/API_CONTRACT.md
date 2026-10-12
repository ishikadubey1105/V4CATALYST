# Baton API contract (v1)

The frontend calls only the routes below. The source of truth is `src/api/contracts.ts`; the
Admin console › **API integration** tab renders the same list live. Record shapes are in `src/lib/types.ts`.

## Conventions

- Base URL: `VITE_API_BASE_URL` (e.g. `https://api.example.com/api`). Set `VITE_API_MODE=http` to use it.
- Auth: `POST /auth/login` returns `{ token, user }`. Send `Authorization: Bearer <token>` on every other call.
  A `401` clears the session and returns the user to the login page.
- Errors: non-2xx with JSON body `{ "code": "STRING_CODE", "message": "Human readable" }`.
  The UI shows `message` and `code` in a toast; login shows `INVALID_USER` as **"Invalid user"**.
- After every mutation the frontend calls `GET /sync` and replaces its cache. The server must apply the
  visibility rules there: employees receive only cases they own, receive, have tasks on, or owned before;
  admins and auditors receive everything.
- The server owns these rules (the mock enforces the same ones, in `src/api/mock.ts`):
  - completeness check on `POST /cases/:id/handoffs` → `422 INCOMPLETE_HANDOFF`
  - stage moves → `409 STAGE_BLOCKED` (Handoff stage is workflow-only; Resolved needs all tasks done)
  - accept needs all 5 acks and no open questions → `409 NOT_ACKNOWLEDGED` / `409 OPEN_QUESTIONS`
  - 5 failed logins lock the account → `ACCOUNT_LOCKED`; disabled accounts → `ACCOUNT_DISABLED`
  - every mutation appends an audit row; a refused case read is logged as `access.denied`
  - deadline job: notify assignee + owner once per overdue task (`deadline.overdue`)

## Endpoints

| Method | Path | Request | Response | Errors | UI |
|---|---|---|---|---|---|
| POST | `/auth/login` | `{ username, password }` | `{ token, user: Employee }` | INVALID_USER, INVALID_PASSWORD, ACCOUNT_LOCKED, ACCOUNT_DISABLED | Login |
| POST | `/auth/logout` | — | `{ ok }` | | Layout |
| GET | `/sync` | — | `Snapshot` | | after every call |
| POST | `/cases` | `CreateCaseReq` | `Case` | | Register complaint |
| PATCH | `/cases/:id/stage` | `{ stage }` | `Case` | STAGE_BLOCKED, FORBIDDEN | Pipeline bar, Board |
| POST | `/cases/:id/reassign` | `{ toId, reason }` | `Case` | FORBIDDEN | Admin reassign |
| POST | `/cases/:id/tasks` | `{ title }` | `Task` | | Actions tab |
| PATCH | `/tasks/:id` | `{ ownerId?, due?, done? }` | `Task` | FORBIDDEN | Actions tab |
| POST | `/cases/:id/notes` | `{ title, body }` | `{ ok }` | | Context tab |
| POST | `/cases/:id/decisions` | `{ title, rationale }` | `{ ok }` | | Context tab |
| POST | `/cases/:id/documents` | multipart `files[]` | `{ ok }` | | Documents tab |
| POST | `/cases/:id/questions` | `{ text, handoffId? }` | `{ ok }` | | Context tab, Review |
| POST | `/questions/:id/answer` | `{ answer }` | `{ ok }` | | Context tab, Review |
| POST | `/cases/:id/handoffs` | `{ toId, reason, reasonNote, summary }` | `Handoff` | INCOMPLETE_HANDOFF, FORBIDDEN | Forward wizard |
| POST | `/handoffs/:id/acks` | `{ section, value }` | `Handoff` | FORBIDDEN | Review |
| POST | `/handoffs/:id/accept` | — | `Handoff` | NOT_ACKNOWLEDGED, OPEN_QUESTIONS | Review |
| POST | `/handoffs/:id/reject` | `{ reason }` | `Handoff` | | Review |
| POST | `/notifications/:id/read` | — | `{ ok }` | | Notifications |
| POST | `/notifications/read-all` | — | `{ ok }` | | Notifications |
| POST | `/employees` | `{ username, name, email, department, title, orgRole }` | `{ employee, tempPassword }` | USERNAME_TAKEN, EMAIL_TAKEN | Admin › Add employee |
| PATCH | `/employees/:id` | `{ orgRole?, active?, department?, title? }` | `Employee` | FORBIDDEN | Admin › Employees |

`Snapshot` = `{ employees, cases, notes, decisions, docs, tasks, questions, handoffs, ownership, notifications, audit }`.
`Employee` never contains a password.
