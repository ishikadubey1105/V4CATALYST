import type {
  AckReq, AiDraftReq, AiResult, AlertsRes, Report, ReportQuery, CreateCaseReq, CreateDecisionReq, CreateEmployeeReq, CreateNoteReq, ReassignReq, SubmitHandoffReq, UpdateEmployeeReq, UpdateTaskReq,
} from './contracts'
import type { Employee, Stage } from '../lib/types'

/**
 * The interface every adapter implements. UI components only ever call these methods —
 * never the store's internal actions — so the transport can change without touching screens.
 */
export interface Api {
  login(username: string, password: string): Promise<Employee>
  logout(): Promise<void>
  sync(): Promise<void>

  createCase(input: CreateCaseReq): Promise<string>
  moveStage(caseId: string, stage: Stage): Promise<void>
  reassign(caseId: string, body: ReassignReq): Promise<void>

  createTask(caseId: string, title: string): Promise<void>
  updateTask(taskId: string, patch: UpdateTaskReq): Promise<void>
  createNote(caseId: string, body: CreateNoteReq): Promise<void>
  createDecision(caseId: string, body: CreateDecisionReq): Promise<void>
  uploadDocuments(caseId: string, files: File[]): Promise<void>
  askQuestion(caseId: string, text: string, handoffId?: string): Promise<void>
  answerQuestion(questionId: string, answer: string): Promise<void>

  submitHandoff(caseId: string, body: SubmitHandoffReq): Promise<string>
  setAck(handoffId: string, body: AckReq): Promise<void>
  acceptHandoff(handoffId: string): Promise<void>
  rejectHandoff(handoffId: string, reason: string): Promise<void>

  markRead(notificationId: string): Promise<void>
  markAllRead(): Promise<void>

  createEmployee(body: CreateEmployeeReq): Promise<{ id: string; tempPassword: string }>
  updateEmployee(id: string, patch: UpdateEmployeeReq): Promise<void>

  aiHandoffDraft(caseId: string, body: AiDraftReq): Promise<AiResult>
  aiHandoffBrief(handoffId: string): Promise<AiResult>

  alerts(): Promise<AlertsRes>
  report(q: ReportQuery): Promise<Report>
  /** Saves the report PDF to the user's downloads. */
  reportPdf(q: ReportQuery): Promise<void>

  /** Mock: runs the deadline job locally. HTTP: the server runs it on a schedule; we just re-sync. */
  pollDeadlines(): Promise<number>
  /** Mock: records the 403 in the audit log. HTTP: the server logs it when it refuses the request. */
  reportAccessDenied(caseId: string): Promise<void>
}
