import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import * as seed from '../data/mock'
import { dueState, reasonLabel, uid } from '../lib/utils'
import type {
  AuditEvent, Case, ContextNote, Decision, Doc, DocKind, Draft, Employee, Handoff, Notification, NotificationKind,
  OwnershipEntry, Question, SectionKey, Stage, Task,
} from '../lib/types'

/**
 * Client-side stand-in for the central database. Every mutating action writes an audit row,
 * so replacing this with API calls later keeps the same shapes.
 */

export interface Toast { id: string; title: string; body?: string; tone: 'info' | 'success' | 'danger' | 'warning' }

const MAX_FAILED_LOGINS = 5

interface Data {
  employees: Employee[]
  cases: Case[]
  notes: ContextNote[]
  decisions: Decision[]
  docs: Doc[]
  tasks: Task[]
  questions: Question[]
  handoffs: Handoff[]
  ownership: OwnershipEntry[]
  notifications: Notification[]
  audit: AuditEvent[]
  drafts: Record<string, Draft>
  notifiedOverdue: string[]
  failedLogins: Record<string, number>
  credentials: Record<string, string> // mock only — the real backend never sends this
}

/** What GET /sync returns: every record the signed-in user may see. */
export type Snapshot = Omit<Data, 'drafts' | 'notifiedOverdue' | 'failedLogins' | 'credentials'>

export type NewCase = Pick<Case, 'title' | 'complainant' | 'channel' | 'category' | 'priority' | 'summary' | 'ownerId'>
export type NewEmployee = Pick<Employee, 'username' | 'name' | 'email' | 'department' | 'title' | 'orgRole'>

interface State extends Data {
  currentUserId: string | null
  toasts: Toast[]
  signIn: (username: string, password: string) => { ok: true; userId: string } | { ok: false; code: string; error: string }
  signOut: () => void
  setSession: (userId: string | null) => void
  hydrate: (snap: Snapshot) => void
  resetDemo: () => void
  toast: (t: Omit<Toast, 'id'>) => void
  dismissToast: (id: string) => void

  addEmployee: (e: NewEmployee) => { id: string; tempPassword: string } | { error: string }
  updateEmployee: (id: string, patch: Partial<Pick<Employee, 'orgRole' | 'active' | 'department' | 'title'>>) => void

  createCase: (input: NewCase) => string
  moveStage: (caseId: string, to: Stage) => void
  logAccessDenied: (caseId: string) => void
  updateTask: (id: string, patch: Partial<Task>) => void
  addTask: (caseId: string, title: string) => void
  addNote: (caseId: string, title: string, body: string) => void
  addDecision: (caseId: string, title: string, rationale: string) => void
  addDocs: (caseId: string, files: { name: string; size: number }[]) => void
  askQuestion: (caseId: string, text: string, handoffId?: string) => void
  answerQuestion: (id: string, answer: string) => void

  saveDraft: (caseId: string, draft: Partial<Draft>) => void
  discardDraft: (caseId: string) => void
  submitHandoff: (caseId: string, score: number) => string | null
  toggleAck: (handoffId: string, section: SectionKey) => void
  acceptHandoff: (handoffId: string) => void
  rejectHandoff: (handoffId: string, reason: string) => void
  forceReassign: (caseId: string, toId: string, reason: string) => void

  markRead: (id: string) => void
  markAllRead: () => void
  runDeadlineWatcher: () => number
}

const initialData = (): Data => ({
  employees: seed.employees,
  cases: seed.cases,
  notes: seed.notes,
  decisions: seed.decisions,
  docs: seed.docs,
  tasks: seed.tasks,
  questions: seed.questions,
  handoffs: seed.handoffs,
  ownership: seed.ownership,
  notifications: seed.notifications,
  audit: seed.audit,
  drafts: {},
  notifiedOverdue: [],
  failedLogins: {},
  credentials: { ...seed.credentials },
})

const nowIso = () => new Date().toISOString()
const tones = ['bg-sky-100 text-sky-900', 'bg-amber-100 text-amber-900', 'bg-emerald-100 text-emerald-900', 'bg-rose-100 text-rose-900', 'bg-indigo-100 text-indigo-900', 'bg-stone-200 text-stone-900', 'bg-teal-100 text-teal-900']

const kindFromName = (name: string): DocKind => {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return 'pdf'
  if (['doc', 'docx', 'txt', 'md'].includes(ext)) return 'doc'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'sheet'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'image'
  return 'other'
}

export const useStore = create<State>()(
  persist(
    (set, get) => {
      const me = () => get().currentUserId ?? 'system'
      const nameOf = (id: string) => get().employees.find((u) => u.id === id)?.name ?? 'Someone'
      const caseOf = (id: string) => get().cases.find((c) => c.id === id)
      const log = (action: string, detail: string, caseId?: string, actorId = me()): AuditEvent =>
        ({ id: uid('a'), at: nowIso(), actorId, action, caseId, detail })
      const notify = (userId: string, kind: NotificationKind, title: string, body: string, link: string): Notification =>
        ({ id: uid('nt'), userId, kind, title, body, link, at: nowIso(), read: false })
      const touch = (cases: Case[], caseId: string, patch: Partial<Case> = {}) =>
        cases.map((c) => (c.id === caseId ? { ...c, ...patch, updatedAt: nowIso() } : c))

      return {
        ...initialData(),
        currentUserId: null,
        toasts: [],

        /* ---------- Auth ---------- */

        signIn: (username, password) => {
          const s = get()
          const key = username.trim().toLowerCase()
          const user = s.employees.find((u) => u.username === key || u.email.toLowerCase() === key)
          if (!user) {
            set({ audit: [...s.audit, log('auth.invalid_user', `Sign-in attempt with unknown user "${key}"`, undefined, 'system')] })
            return { ok: false, code: 'INVALID_USER', error: 'Invalid user. This username is not registered.' }
          }
          const fails = s.failedLogins[user.username] ?? 0
          if (fails >= MAX_FAILED_LOGINS) {
            return { ok: false, code: 'ACCOUNT_LOCKED', error: 'Account locked after too many failed attempts. Ask an admin to unlock it.' }
          }
          if (s.credentials[user.username] !== password) {
            set({
              failedLogins: { ...s.failedLogins, [user.username]: fails + 1 },
              audit: [...s.audit, log('auth.failed', `Wrong password for ${user.username} (${fails + 1}/${MAX_FAILED_LOGINS})`, undefined, user.id)],
            })
            return { ok: false, code: 'INVALID_PASSWORD', error: `Incorrect password. ${MAX_FAILED_LOGINS - fails - 1} attempts left.` }
          }
          if (!user.active) {
            set({ audit: [...s.audit, log('auth.blocked', `Disabled account ${user.username} tried to sign in`, undefined, user.id)] })
            return { ok: false, code: 'ACCOUNT_DISABLED', error: 'This account has been disabled by an administrator.' }
          }
          const { [user.username]: _, ...rest } = s.failedLogins
          void _
          set({ currentUserId: user.id, failedLogins: rest, audit: [...s.audit, log('auth.login', `${user.name} signed in`, undefined, user.id)] })
          return { ok: true, userId: user.id }
        },
        signOut: () => set((s) => ({ currentUserId: null, audit: [...s.audit, log('auth.logout', `${nameOf(me())} signed out`)] })),
        setSession: (userId) => set({ currentUserId: userId }),
        hydrate: (snap) => set({ ...snap }),
        resetDemo: () => set({ ...initialData(), currentUserId: null, toasts: [] }),
        toast: (t) => {
          const id = uid('t')
          set((s) => ({ toasts: [...s.toasts, { ...t, id }] }))
          setTimeout(() => get().dismissToast(id), 5000)
        },
        dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

        /* ---------- Employee directory ---------- */

        addEmployee: (e) => {
          const s = get()
          if (s.employees.some((u) => u.username === e.username)) return { error: 'That username is already taken.' }
          if (s.employees.some((u) => u.email.toLowerCase() === e.email.toLowerCase())) return { error: 'An employee with this email already exists.' }
          const id = uid('e')
          const tempPassword = `Temp-${Math.random().toString(36).slice(2, 8)}`
          set({
            employees: [...s.employees, { ...e, id, active: true, tone: tones[s.employees.length % tones.length] }],
            credentials: { ...s.credentials, [e.username]: tempPassword },
            audit: [...s.audit, log('employee.created', `${e.name} (${e.username}) as ${e.orgRole}`)],
          })
          return { id, tempPassword }
        },
        updateEmployee: (id, patch) => set((s) => {
          const u = s.employees.find((x) => x.id === id)
          if (!u) return {}
          const events: AuditEvent[] = []
          if (patch.orgRole && patch.orgRole !== u.orgRole) events.push(log('employee.role_changed', `${u.name}: ${u.orgRole} → ${patch.orgRole}`))
          if (patch.active !== undefined && patch.active !== u.active) events.push(log(patch.active ? 'employee.enabled' : 'employee.disabled', u.name))
          // Re-enabling an account also clears its failed-login lock.
          const failedLogins = patch.active ? Object.fromEntries(Object.entries(s.failedLogins).filter(([k]) => k !== u.username)) : s.failedLogins
          return { employees: s.employees.map((x) => (x.id === id ? { ...x, ...patch } : x)), audit: [...s.audit, ...events], failedLogins }
        }),

        /* ---------- Cases ---------- */

        createCase: (input) => {
          const s = get()
          const id = uid('c')
          const max = Math.max(...s.cases.map((c) => Number(c.code.split('-')[1]) || 0))
          const code = `CMP-${max + 1}`
          const at = nowIso()
          const assignedToOther = input.ownerId !== me()
          set({
            cases: [{ ...input, id, code, stage: 'received', createdBy: me(), receivedAt: at, updatedAt: at }, ...s.cases],
            ownership: [...s.ownership, { caseId: id, userId: input.ownerId, from: at, via: 'created' }],
            notifications: assignedToOther
              ? [...s.notifications, notify(input.ownerId, 'assigned', `New complaint assigned: ${code}`, `${nameOf(me())} registered "${input.title}" and made you owner`, `/cases/${id}`)]
              : s.notifications,
            audit: [...s.audit, log('case.created', `Registered ${code} from ${input.channel}; owner ${nameOf(input.ownerId)}`, id)],
          })
          return id
        },
        moveStage: (caseId, to) => set((s) => {
          const c = caseOf(caseId)
          if (!c || c.stage === to) return {}
          return {
            cases: touch(s.cases, caseId, { stage: to }),
            audit: [...s.audit, log('stage.changed', `${c.stage} → ${to}`, caseId)],
          }
        }),
        logAccessDenied: (caseId) => set((s) => ({ audit: [...s.audit, log('access.denied', `Tried to open ${caseOf(caseId)?.code ?? caseId} without a relationship to it`, caseId)] })),

        updateTask: (id, patch) => set((s) => {
          const task = s.tasks.find((t) => t.id === id)
          if (!task) return {}
          const parts: string[] = []
          if ('ownerId' in patch) parts.push(`assignee → ${patch.ownerId ? nameOf(patch.ownerId) : 'none'}`)
          if ('due' in patch) parts.push(`deadline → ${patch.due ? patch.due.slice(0, 10) : 'none'}`)
          if ('done' in patch) parts.push(patch.done ? 'completed' : 'reopened')
          const newAssignee = patch.ownerId && patch.ownerId !== task.ownerId && patch.ownerId !== me() ? patch.ownerId : null
          const c = caseOf(task.caseId)
          return {
            tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
            cases: touch(s.cases, task.caseId),
            notifications: newAssignee
              ? [...s.notifications, notify(newAssignee, 'assigned', `Task assigned on ${c?.code}`, task.title, `/cases/${task.caseId}?tab=actions&highlight=${task.id}`)]
              : s.notifications,
            audit: [...s.audit, log('task.updated', `${task.title}: ${parts.join(', ')}`, task.caseId)],
          }
        }),
        addTask: (caseId, title) => set((s) => ({
          tasks: [...s.tasks, { id: uid('t'), caseId, title, done: false }],
          cases: touch(s.cases, caseId),
          audit: [...s.audit, log('task.created', title, caseId)],
        })),
        addNote: (caseId, title, body) => set((s) => ({
          notes: [...s.notes, { id: uid('n'), caseId, title, body, by: me(), at: nowIso() }],
          cases: touch(s.cases, caseId),
          audit: [...s.audit, log('note.added', title, caseId)],
        })),
        addDecision: (caseId, title, rationale) => set((s) => ({
          decisions: [...s.decisions, { id: uid('d'), caseId, title, rationale, by: me(), at: nowIso() }],
          cases: touch(s.cases, caseId),
          audit: [...s.audit, log('decision.added', title, caseId)],
        })),
        addDocs: (caseId, files) => set((s) => ({
          docs: [...s.docs, ...files.map((f) => ({ id: uid('f'), caseId, name: f.name, size: f.size, kind: kindFromName(f.name), by: me(), at: nowIso() }))],
          cases: touch(s.cases, caseId),
          audit: [...s.audit, ...files.map((f) => log('document.uploaded', f.name, caseId))],
        })),
        askQuestion: (caseId, text, handoffId) => set((s) => {
          const c = caseOf(caseId)
          const handoff = s.handoffs.find((h) => h.id === handoffId)
          const recipient = handoff?.fromId ?? c?.ownerId
          return {
            questions: [...s.questions, { id: uid('q'), caseId, handoffId, text, by: me(), at: nowIso() }],
            notifications: recipient && recipient !== me()
              ? [...s.notifications, notify(recipient, 'question', `New question on ${c?.code}`, `${nameOf(me())}: ${text}`, handoffId ? `/handoffs/${handoffId}` : `/cases/${caseId}?tab=context`)]
              : s.notifications,
            audit: [...s.audit, log('question.asked', text, caseId)],
          }
        }),
        answerQuestion: (id, answer) => set((s) => {
          const q = s.questions.find((x) => x.id === id)
          if (!q) return {}
          return {
            questions: s.questions.map((x) => (x.id === id ? { ...x, answer, answeredBy: me() } : x)),
            notifications: [...s.notifications, notify(q.by, 'answer', 'Your question was answered', answer, q.handoffId ? `/handoffs/${q.handoffId}` : `/cases/${q.caseId}?tab=context`)],
            audit: [...s.audit, log('question.answered', answer, q.caseId)],
          }
        }),

        /* ---------- Forwarding (handoff) ---------- */

        saveDraft: (caseId, patch) => set((s) => {
          const prev = s.drafts[caseId] ?? { summary: '', reasonNote: '' }
          return { drafts: { ...s.drafts, [caseId]: { ...prev, ...patch } } }
        }),
        discardDraft: (caseId) => set((s) => {
          const { [caseId]: _, ...rest } = s.drafts
          void _
          return { drafts: rest }
        }),
        submitHandoff: (caseId, score) => {
          const s = get()
          const draft = s.drafts[caseId]
          const c = caseOf(caseId)
          if (!draft?.toId || !draft.reason || !c) return null
          const id = uid('h')
          const h: Handoff = {
            id, caseId, fromId: c.ownerId, toId: draft.toId, reason: draft.reason, reasonNote: draft.reasonNote, summary: draft.summary,
            status: 'submitted', createdAt: nowIso(),
            acks: { overview: false, context: false, documents: false, actions: false, questions: false },
          }
          const { [caseId]: _, ...rest } = s.drafts
          void _
          set({
            handoffs: [...s.handoffs, h],
            drafts: rest,
            cases: touch(s.cases, caseId, { stage: 'handoff', prevStage: c.stage }),
            notifications: [
              ...s.notifications,
              notify(draft.toId, 'handoff', 'Case forwarded to you', `${nameOf(c.ownerId)} forwarded ${c.code} · Reason: ${reasonLabel[draft.reason].toLowerCase()}`, `/handoffs/${id}`),
            ],
            audit: [...s.audit, log('handoff.submitted', `Forwarded to ${nameOf(draft.toId)} · ${draft.reason}: ${draft.reasonNote} · score ${score}%`, caseId)],
          })
          return id
        },
        toggleAck: (handoffId, section) => set((s) => {
          const h = s.handoffs.find((x) => x.id === handoffId)
          if (!h) return {}
          const value = !h.acks[section]
          return {
            handoffs: s.handoffs.map((x) => (x.id === handoffId ? { ...x, acks: { ...x.acks, [section]: value } } : x)),
            audit: [...s.audit, log(value ? 'section.acknowledged' : 'section.unacknowledged', `Section "${section}"`, h.caseId)],
          }
        }),
        acceptHandoff: (handoffId) => set((s) => {
          const h = s.handoffs.find((x) => x.id === handoffId)
          const c = h && caseOf(h.caseId)
          if (!h || !c) return {}
          const at = nowIso()
          return {
            handoffs: s.handoffs.map((x) => (x.id === handoffId ? { ...x, status: 'accepted', decidedAt: at } : x)),
            cases: touch(s.cases, h.caseId, { ownerId: h.toId, stage: c.prevStage ?? 'investigation', prevStage: undefined }),
            ownership: [
              ...s.ownership.map((o) => (o.caseId === h.caseId && !o.to ? { ...o, to: at } : o)),
              { caseId: h.caseId, userId: h.toId, from: at, via: 'handoff' as const, reason: `${reasonLabel[h.reason]}: ${h.reasonNote}` },
            ],
            notifications: [...s.notifications, notify(h.fromId, 'accepted', 'Forward accepted', `${nameOf(h.toId)} now owns ${c.code}`, `/cases/${h.caseId}?tab=history`)],
            audit: [...s.audit, log('handoff.accepted', `Ownership ${nameOf(h.fromId)} → ${nameOf(h.toId)}; all 5 sections acknowledged`, h.caseId)],
          }
        }),
        rejectHandoff: (handoffId, reason) => set((s) => {
          const h = s.handoffs.find((x) => x.id === handoffId)
          const c = h && caseOf(h.caseId)
          if (!h || !c) return {}
          return {
            handoffs: s.handoffs.map((x) => (x.id === handoffId ? { ...x, status: 'rejected', decidedAt: nowIso(), rejectReason: reason } : x)),
            cases: touch(s.cases, h.caseId, { stage: c.prevStage ?? 'investigation', prevStage: undefined }),
            drafts: { ...s.drafts, [h.caseId]: { toId: h.toId, reason: h.reason, reasonNote: h.reasonNote, summary: h.summary } },
            notifications: [...s.notifications, notify(h.fromId, 'rejected', `Forward of ${c.code} rejected`, `${nameOf(h.toId)}: ${reason}`, `/cases/${h.caseId}/forward?step=2`)],
            audit: [...s.audit, log('handoff.rejected', reason, h.caseId)],
          }
        }),
        forceReassign: (caseId, toId, reason) => set((s) => {
          const c = caseOf(caseId)
          if (!c) return {}
          const at = nowIso()
          const stage = c.stage === 'handoff' ? c.prevStage ?? 'investigation' : c.stage
          return {
            cases: touch(s.cases, caseId, { ownerId: toId, stage, prevStage: undefined }),
            handoffs: s.handoffs.map((h) => (h.caseId === caseId && h.status === 'submitted' ? { ...h, status: 'rejected', decidedAt: at, rejectReason: 'Superseded by admin reassignment' } : h)),
            ownership: [
              ...s.ownership.map((o) => (o.caseId === caseId && !o.to ? { ...o, to: at } : o)),
              { caseId, userId: toId, from: at, via: 'forced' as const, reason },
            ],
            notifications: [
              ...s.notifications,
              notify(toId, 'force', `You now own ${c.code}`, `Reassigned by ${nameOf(me())}: ${reason}`, `/cases/${caseId}`),
              notify(c.ownerId, 'force', `${c.code} was reassigned`, `Reassigned by ${nameOf(me())}: ${reason}`, `/cases/${caseId}?tab=history`),
            ],
            audit: [...s.audit, log('handoff.forced', `${nameOf(c.ownerId)} → ${nameOf(toId)}. Reason: ${reason}`, caseId)],
          }
        }),

        /* ---------- Notifications ---------- */

        markRead: (id) => set((s) => ({ notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) })),
        markAllRead: () => set((s) => ({ notifications: s.notifications.map((n) => (n.userId === s.currentUserId ? { ...n, read: true } : n)) })),

        /** Scans for overdue tasks and notifies the assignee and case owner once per task. */
        runDeadlineWatcher: () => {
          const s = get()
          const fresh = s.tasks.filter((t) => dueState(t) === 'overdue' && !s.notifiedOverdue.includes(t.id))
          if (!fresh.length) return 0
          const notes: Notification[] = []
          for (const t of fresh) {
            const c = caseOf(t.caseId)
            const recipients = new Set([t.ownerId, c?.ownerId].filter(Boolean) as string[])
            recipients.forEach((u) => notes.push(notify(u, 'overdue', `Overdue: ${t.title}`, `${c?.code} · ${c?.title}`, `/cases/${t.caseId}?tab=actions&highlight=${t.id}`)))
          }
          set({
            notifications: [...s.notifications, ...notes],
            notifiedOverdue: [...s.notifiedOverdue, ...fresh.map((t) => t.id)],
            audit: [...s.audit, ...fresh.map((t) => log('deadline.overdue', t.title, t.caseId, 'system'))],
          })
          return fresh.length
        },
      }
    },
    {
      name: 'baton-db-v3',
      partialize: ({ toasts: _t, ...rest }) => rest,
    },
  ),
)

export const useMe = () => {
  const id = useStore((s) => s.currentUserId)
  const employees = useStore((s) => s.employees)
  return employees.find((u) => u.id === id) ?? null
}

/** Convenience: the relation tables permissions.ts needs. */
export const useRelations = () => {
  const handoffs = useStore((s) => s.handoffs)
  const tasks = useStore((s) => s.tasks)
  const ownership = useStore((s) => s.ownership)
  return { handoffs, tasks, ownership }
}
