import { useStore } from '../store/useStore'
import { runCompleteness } from '../lib/completeness'
import { canEditCase, stageMoveBlocked } from '../lib/permissions'
import { ApiError, tokenStore } from './client'
import type { Api } from './types'

/**
 * Mock backend. Implements the same Api as http.ts, but against the in-browser store,
 * and enforces the same rules the server will (permissions, completeness, stage moves).
 */
const db = () => useStore.getState()
const latency = () => new Promise((r) => setTimeout(r, 120 + Math.random() * 120))
const me = () => {
  const s = db()
  const u = s.employees.find((x) => x.id === s.currentUserId)
  if (!u || !u.active) throw new ApiError(401, 'UNAUTHENTICATED', 'Your session has ended. Please sign in again.')
  return u
}
const forbid = (msg = 'You do not have permission to do that.') => { throw new ApiError(403, 'FORBIDDEN', msg) }
const caseOrThrow = (id: string) => db().cases.find((c) => c.id === id) ?? (() => { throw new ApiError(404, 'NOT_FOUND', 'Case not found') })()

export const mockApi: Api = {
  async login(username, password) {
    await latency()
    const res = db().signIn(username, password)
    if (!res.ok) throw new ApiError(401, res.code, res.error)
    tokenStore.set(`mock.${res.userId}.${Date.now()}`)
    return db().employees.find((u) => u.id === res.userId)!
  },
  async logout() { db().signOut(); tokenStore.set(null) },
  async sync() { /* the store is already the source of truth */ },

  async createCase(input) {
    await latency()
    if (me().orgRole === 'auditor') forbid()
    return db().createCase(input)
  },
  async moveStage(caseId, stage) {
    await latency()
    const c = caseOrThrow(caseId)
    if (!canEditCase(me(), c)) forbid('Only the case owner or an admin can move a case.')
    const blocked = stageMoveBlocked(c, stage, db().tasks)
    if (blocked) throw new ApiError(409, 'STAGE_BLOCKED', blocked)
    db().moveStage(caseId, stage)
  },
  async reassign(caseId, { toId, reason }) {
    await latency()
    if (me().orgRole !== 'admin') forbid('Only admins can reassign.')
    db().forceReassign(caseId, toId, reason)
  },

  async createTask(caseId, title) { await latency(); if (!canEditCase(me(), caseOrThrow(caseId))) forbid(); db().addTask(caseId, title) },
  async updateTask(taskId, patch) {
    await latency()
    const t = db().tasks.find((x) => x.id === taskId)
    if (!t) throw new ApiError(404, 'NOT_FOUND', 'Task not found')
    const u = me()
    const onlyTicking = Object.keys(patch).every((k) => k === 'done')
    if (!canEditCase(u, caseOrThrow(t.caseId)) && !(onlyTicking && t.ownerId === u.id)) forbid()
    db().updateTask(taskId, patch)
  },
  async createNote(caseId, { title, body }) { await latency(); if (!canEditCase(me(), caseOrThrow(caseId))) forbid(); db().addNote(caseId, title, body) },
  async createDecision(caseId, { title, rationale }) { await latency(); if (!canEditCase(me(), caseOrThrow(caseId))) forbid(); db().addDecision(caseId, title, rationale) },
  async uploadDocuments(caseId, files) {
    await latency()
    if (!canEditCase(me(), caseOrThrow(caseId))) forbid()
    db().addDocs(caseId, files.map((f) => ({ name: f.name, size: f.size })))
  },
  async askQuestion(caseId, text, handoffId) { await latency(); if (me().orgRole === 'auditor') forbid(); db().askQuestion(caseId, text, handoffId) },
  async answerQuestion(id, answer) { await latency(); me(); db().answerQuestion(id, answer) },

  async submitHandoff(caseId, body) {
    await latency()
    const c = caseOrThrow(caseId)
    if (c.ownerId !== me().id) forbid('Only the current owner can forward this case.')
    const s = db()
    // Server-side re-check: never trust the client's completeness result.
    const check = runCompleteness({ caseId, draft: body, tasks: s.tasks, decisions: s.decisions, docs: s.docs, questions: s.questions })
    if (!check.ok) throw new ApiError(422, 'INCOMPLETE_HANDOFF', `Handoff is incomplete (${check.passed}/${check.total} checks pass).`)
    s.saveDraft(caseId, body)
    const id = s.submitHandoff(caseId, check.score)
    if (!id) throw new ApiError(400, 'BAD_REQUEST', 'Could not submit handoff.')
    return id
  },
  async setAck(handoffId, { section, value }) {
    await latency()
    const h = db().handoffs.find((x) => x.id === handoffId)
    if (!h || h.toId !== me().id || h.status !== 'submitted') forbid('Only the receiver can acknowledge sections.')
    if (h!.acks[section] !== value) db().toggleAck(handoffId, section)
  },
  async acceptHandoff(handoffId) {
    await latency()
    const s = db()
    const h = s.handoffs.find((x) => x.id === handoffId)
    if (!h || h.toId !== me().id) return forbid()
    if (!Object.values(h.acks).every(Boolean)) throw new ApiError(409, 'NOT_ACKNOWLEDGED', 'Acknowledge every section first.')
    if (s.questions.some((q) => q.caseId === h.caseId && !q.answer)) throw new ApiError(409, 'OPEN_QUESTIONS', 'Open questions must be answered first.')
    s.acceptHandoff(handoffId)
  },
  async rejectHandoff(handoffId, reason) {
    await latency()
    const h = db().handoffs.find((x) => x.id === handoffId)
    if (!h || h.toId !== me().id) forbid()
    db().rejectHandoff(handoffId, reason)
  },

  async markRead(id) { db().markRead(id) },
  async markAllRead() { db().markAllRead() },

  async createEmployee(body) {
    await latency()
    if (me().orgRole !== 'admin') forbid()
    const res = db().addEmployee(body)
    if ('error' in res) throw new ApiError(409, res.error.includes('username') ? 'USERNAME_TAKEN' : 'EMAIL_TAKEN', res.error)
    return res
  },
  async updateEmployee(id, patch) {
    await latency()
    const u = me()
    if (u.orgRole !== 'admin') forbid()
    if (u.id === id) forbid('You cannot change your own account.')
    db().updateEmployee(id, patch)
  },

  async pollDeadlines() { return db().runDeadlineWatcher() },
  async reportAccessDenied(caseId) { db().logAccessDenied(caseId) },
}
