import type { Case, CaseRole, Employee, Handoff, OrgRole, OwnershipEntry, Stage, Task } from './types'

/**
 * Employees have no fixed "owner/receiver" role. Their relationship to a complaint is derived
 * from the records: who owns it now, who it is being forwarded to, who has tasks on it, who owned it before.
 */
export interface Relations { handoffs: Handoff[]; tasks: Task[]; ownership: OwnershipEntry[] }

export function caseRole(u: Employee | null, c: Case, r: Relations): CaseRole {
  if (!u) return 'none'
  if (c.ownerId === u.id) return 'owner'
  if (r.handoffs.some((h) => h.caseId === c.id && h.status === 'submitted' && h.toId === u.id)) return 'receiver'
  if (r.tasks.some((t) => t.caseId === c.id && t.ownerId === u.id && !t.done)) return 'assignee'
  if (r.ownership.some((o) => o.caseId === c.id && o.userId === u.id)) return 'previous_owner'
  if (u.orgRole === 'admin') return 'admin'
  if (u.orgRole === 'auditor') return 'auditor'
  return 'none'
}

export const caseRoleLabel: Record<CaseRole, string> = {
  owner: 'Owner',
  receiver: 'Incoming',
  assignee: 'Assignee',
  previous_owner: 'Previous owner',
  admin: 'Admin',
  auditor: 'Auditor',
  none: 'No access',
}

/** Admins and auditors see every case; employees only see cases they are connected to. */
export const canViewCase = (u: Employee | null, c: Case, r: Relations) =>
  !!u && (u.orgRole !== 'employee' || caseRole(u, c, r) !== 'none')

export const canEditCase = (u: Employee | null, c: Case) =>
  !!u && u.orgRole !== 'auditor' && (u.id === c.ownerId || u.orgRole === 'admin')

export const canForward = (u: Employee | null, c: Case) =>
  !!u && c.stage !== 'handoff' && c.stage !== 'resolved' && u.id === c.ownerId

export const canForceReassign = (u: Employee | null, c: Case) =>
  u?.orgRole === 'admin' && c.stage !== 'resolved'

export const canActOnHandoff = (u: Employee | null, h: Handoff) =>
  !!u && h.status === 'submitted' && u.id === h.toId

export const isReadOnly = (u: Employee | null) => u?.orgRole === 'auditor'

export const routeAccess = {
  any: ['employee', 'admin', 'auditor'],
  console: ['admin'],
  audit: ['admin', 'auditor'],
} satisfies Record<string, OrgRole[]>

/* ---------- Pipeline ---------- */

export const stages: { key: Stage; label: string; hint: string }[] = [
  { key: 'received', label: 'Received', hint: 'Logged and acknowledged to the complainant' },
  { key: 'investigation', label: 'Investigation', hint: 'Facts, evidence and root cause' },
  { key: 'action', label: 'Action', hint: 'Remedy agreed and being delivered' },
  { key: 'handoff', label: 'Handoff', hint: 'Being forwarded to another employee' },
  { key: 'resolved', label: 'Resolved', hint: 'Closed with the complainant' },
]

export const stageIndex = (s: Stage) => stages.findIndex((x) => x.key === s)

/** Returns a reason the move is blocked, or null if allowed. */
export function stageMoveBlocked(c: Case, to: Stage, tasks: Task[]): string | null {
  if (c.stage === 'handoff') return 'Case is in handoff — it moves on when the receiver accepts or rejects.'
  if (to === 'handoff') return 'Use "Forward case" to start a handoff.'
  if (to === 'resolved' && tasks.some((t) => t.caseId === c.id && !t.done)) return 'Close all open tasks before resolving.'
  return null
}
