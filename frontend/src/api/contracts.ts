/**
 * API CONTRACT — the single source of truth shared with the backend.
 *
 * Every entry pairs one frontend action with one backend route: method + path + request DTO + response DTO.
 * The mock adapter (mock.ts) and the HTTP adapter (http.ts) both implement exactly these endpoints, so moving
 * from the demo to the real backend is a config switch (VITE_API_MODE=http), not a rewrite.
 */
import type {
  Case, Channel, Employee, Handoff, HandoffReason, OrgRole, Priority, SectionKey, Stage, Task,
} from '../lib/types'
import type { Snapshot } from '../store/useStore'

export type HttpMethod = 'GET' | 'POST' | 'PATCH'

export interface Endpoint<Req = unknown, Res = unknown> {
  method: HttpMethod
  path: string // ":id" segments are filled from params
  req: string // DTO name, shown in the Integration console
  res: string
  desc: string
  usedBy: string[] // UI components that call it
  errors?: string[] // error codes the backend may return
  /** phantom fields so TypeScript can infer Req/Res from the endpoint object */
  _types?: [Req, Res]
}

/* ---------- DTOs ---------- */

export interface LoginReq { username: string; password: string }
export interface LoginRes { token: string; user: Employee }
export type SyncRes = Snapshot

export interface CreateCaseReq { title: string; complainant: string; channel: Channel; category: string; priority: Priority; summary: string; ownerId: string }
export interface MoveStageReq { stage: Stage }
export interface CreateTaskReq { title: string }
export type UpdateTaskReq = Partial<Pick<Task, 'ownerId' | 'due' | 'done'>>
export interface CreateNoteReq { title: string; body: string }
export interface CreateDecisionReq { title: string; rationale: string }
export interface AskQuestionReq { text: string; handoffId?: string }
export interface AnswerQuestionReq { answer: string }
export interface SubmitHandoffReq { toId: string; reason: HandoffReason; reasonNote: string; summary: string }
export interface AckReq { section: SectionKey; value: boolean }
export interface RejectReq { reason: string }
export interface ReassignReq { toId: string; reason: string }
export interface CreateEmployeeReq { username: string; name: string; email: string; department: string; title: string; orgRole: OrgRole }
export interface CreateEmployeeRes { employee: Employee; tempPassword: string }
export type UpdateEmployeeReq = Partial<Pick<Employee, 'orgRole' | 'active' | 'department' | 'title'>>
export interface Ok { ok: true }

const ep = <Req, Res>(e: Omit<Endpoint<Req, Res>, '_types'>): Endpoint<Req, Res> => e

export const endpoints = {
  login: ep<LoginReq, LoginRes>({ method: 'POST', path: '/auth/login', req: 'LoginReq', res: 'LoginRes', desc: 'Verify username + password; returns a session token', usedBy: ['Login'], errors: ['INVALID_USER', 'INVALID_PASSWORD', 'ACCOUNT_LOCKED', 'ACCOUNT_DISABLED'] }),
  logout: ep<void, Ok>({ method: 'POST', path: '/auth/logout', req: '—', res: 'Ok', desc: 'Invalidate the session token', usedBy: ['Layout'] }),
  sync: ep<void, SyncRes>({ method: 'GET', path: '/sync', req: '—', res: 'Snapshot', desc: 'All records the caller may see (server applies case-visibility rules)', usedBy: ['App bootstrap', 'after every mutation'] }),

  createCase: ep<CreateCaseReq, Case>({ method: 'POST', path: '/cases', req: 'CreateCaseReq', res: 'Case', desc: 'Register a complaint; owner is notified', usedBy: ['CasesList › RegisterModal'] }),
  moveStage: ep<MoveStageReq, Case>({ method: 'PATCH', path: '/cases/:id/stage', req: 'MoveStageReq', res: 'Case', desc: 'Move along the pipeline; server enforces stage rules', usedBy: ['CaseWorkspace › Pipeline', 'Board'], errors: ['STAGE_BLOCKED', 'FORBIDDEN'] }),
  reassign: ep<ReassignReq, Case>({ method: 'POST', path: '/cases/:id/reassign', req: 'ReassignReq', res: 'Case', desc: 'Admin override with mandatory logged reason', usedBy: ['CaseWorkspace › ReassignModal'], errors: ['FORBIDDEN'] }),

  createTask: ep<CreateTaskReq, Task>({ method: 'POST', path: '/cases/:id/tasks', req: 'CreateTaskReq', res: 'Task', desc: 'Add an action item', usedBy: ['CaseWorkspace › Actions'] }),
  updateTask: ep<UpdateTaskReq, Task>({ method: 'PATCH', path: '/tasks/:id', req: 'UpdateTaskReq', res: 'Task', desc: 'Assign, set deadline, complete', usedBy: ['CaseWorkspace › Actions'] }),
  createNote: ep<CreateNoteReq, Ok>({ method: 'POST', path: '/cases/:id/notes', req: 'CreateNoteReq', res: 'Ok', desc: 'Add a context note', usedBy: ['CaseWorkspace › Context'] }),
  createDecision: ep<CreateDecisionReq, Ok>({ method: 'POST', path: '/cases/:id/decisions', req: 'CreateDecisionReq', res: 'Ok', desc: 'Log a decision with rationale', usedBy: ['CaseWorkspace › Context'] }),
  uploadDocuments: ep<FormData, Ok>({ method: 'POST', path: '/cases/:id/documents', req: 'multipart files[]', res: 'Ok', desc: 'Attach files (max 25 MB each)', usedBy: ['CaseWorkspace › Documents'] }),
  askQuestion: ep<AskQuestionReq, Ok>({ method: 'POST', path: '/cases/:id/questions', req: 'AskQuestionReq', res: 'Ok', desc: 'Ask the owner / sender a question', usedBy: ['CaseWorkspace › Context', 'HandoffReview'] }),
  answerQuestion: ep<AnswerQuestionReq, Ok>({ method: 'POST', path: '/questions/:id/answer', req: 'AnswerQuestionReq', res: 'Ok', desc: 'Answer an open question', usedBy: ['CaseWorkspace › Context', 'HandoffReview'] }),

  submitHandoff: ep<SubmitHandoffReq, Handoff>({ method: 'POST', path: '/cases/:id/handoffs', req: 'SubmitHandoffReq', res: 'Handoff', desc: 'Forward a case; server re-runs the completeness check', usedBy: ['ForwardWizard'], errors: ['INCOMPLETE_HANDOFF', 'FORBIDDEN'] }),
  setAck: ep<AckReq, Handoff>({ method: 'POST', path: '/handoffs/:id/acks', req: 'AckReq', res: 'Handoff', desc: 'Receiver acknowledges one section', usedBy: ['HandoffReview'], errors: ['FORBIDDEN'] }),
  acceptHandoff: ep<void, Handoff>({ method: 'POST', path: '/handoffs/:id/accept', req: '—', res: 'Handoff', desc: 'Transfer ownership (all sections acked, no open questions)', usedBy: ['HandoffReview'], errors: ['NOT_ACKNOWLEDGED', 'OPEN_QUESTIONS'] }),
  rejectHandoff: ep<RejectReq, Handoff>({ method: 'POST', path: '/handoffs/:id/reject', req: 'RejectReq', res: 'Handoff', desc: 'Send back to the sender with a reason', usedBy: ['HandoffReview'] }),

  markRead: ep<void, Ok>({ method: 'POST', path: '/notifications/:id/read', req: '—', res: 'Ok', desc: 'Mark one notification read', usedBy: ['Notifications'] }),
  markAllRead: ep<void, Ok>({ method: 'POST', path: '/notifications/read-all', req: '—', res: 'Ok', desc: 'Mark all read', usedBy: ['Notifications'] }),

  createEmployee: ep<CreateEmployeeReq, CreateEmployeeRes>({ method: 'POST', path: '/employees', req: 'CreateEmployeeReq', res: 'CreateEmployeeRes', desc: 'Admin creates an account; returns a one-time password', usedBy: ['AdminConsole › AddEmployee'], errors: ['USERNAME_TAKEN', 'EMAIL_TAKEN', 'FORBIDDEN'] }),
  updateEmployee: ep<UpdateEmployeeReq, Employee>({ method: 'PATCH', path: '/employees/:id', req: 'UpdateEmployeeReq', res: 'Employee', desc: 'Change access level, disable / enable / unlock', usedBy: ['AdminConsole › Employees'], errors: ['FORBIDDEN'] }),
} as const

export type EndpointKey = keyof typeof endpoints
