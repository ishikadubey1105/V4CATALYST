/**
 * Org-level permission only. Whether someone is the owner / receiver / assignee
 * of a complaint is NOT stored on the employee — it is derived per case (see permissions.ts).
 */
export type OrgRole = 'employee' | 'admin' | 'auditor'

/** Public employee record. Credentials never leave the backend (the mock keeps them in a separate table). */
export interface Employee {
  id: string
  username: string
  name: string
  email: string
  department: string
  title: string
  orgRole: OrgRole
  active: boolean
  tone: string // avatar colour classes
}

/** Per-case relationship, computed at runtime. */
export type CaseRole = 'owner' | 'receiver' | 'assignee' | 'previous_owner' | 'admin' | 'auditor' | 'none'

/** The complaint pipeline. 'handoff' is entered and left only through the handoff workflow. */
export type Stage = 'received' | 'investigation' | 'action' | 'handoff' | 'resolved'
export type Priority = 'high' | 'medium' | 'low'
export type Channel = 'Email' | 'Phone' | 'Web form' | 'Branch' | 'Social'

export interface Case {
  id: string
  code: string
  title: string
  complainant: string
  channel: Channel
  category: string
  priority: Priority
  stage: Stage
  prevStage?: Stage
  ownerId: string
  createdBy: string
  summary: string
  receivedAt: string
  updatedAt: string
}

export interface ContextNote { id: string; caseId: string; title: string; body: string; by: string; at: string }
export interface Decision { id: string; caseId: string; title: string; rationale: string; by: string; at: string }
export type DocKind = 'pdf' | 'doc' | 'sheet' | 'image' | 'other'
export interface Doc { id: string; caseId: string; name: string; kind: DocKind; size: number; by: string; at: string }
export interface Task { id: string; caseId: string; title: string; ownerId?: string; due?: string; done: boolean }

export interface Question {
  id: string
  caseId: string
  handoffId?: string
  by: string
  text: string
  at: string
  answer?: string
  answeredBy?: string
}

export type SectionKey = 'overview' | 'context' | 'documents' | 'actions' | 'questions'
export type HandoffStatus = 'submitted' | 'accepted' | 'rejected'
export type HandoffReason = 'leave' | 'reassignment' | 'escalation' | 'expertise' | 'workload' | 'other'

export interface Handoff {
  id: string
  caseId: string
  fromId: string
  toId: string
  reason: HandoffReason
  reasonNote: string
  summary: string
  status: HandoffStatus
  createdAt: string
  decidedAt?: string
  rejectReason?: string
  acks: Record<SectionKey, boolean>
}

export type NotificationKind = 'handoff' | 'question' | 'overdue' | 'accepted' | 'rejected' | 'force' | 'answer' | 'assigned' | 'reminder' | 'escalation'

export interface Notification {
  id: string
  userId: string
  kind: NotificationKind
  title: string
  body: string
  at: string
  read: boolean
  link: string
}

export interface AuditEvent { id: string; at: string; actorId: string; action: string; caseId?: string; detail: string }

export interface OwnershipEntry {
  caseId: string
  userId: string
  from: string
  to?: string
  via: 'created' | 'handoff' | 'forced'
  reason?: string
}

export interface Draft { toId?: string; reason?: HandoffReason; reasonNote: string; summary: string }
