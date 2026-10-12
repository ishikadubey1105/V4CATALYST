import { useStore } from '../store/useStore'
import { useAlerts } from '../store/useAlerts'
import { endpoints, type UpdateTaskReq } from './contracts'
import { downloadFile, fetchFile, request, tokenStore } from './client'
import type { Api } from './types'

/**
 * Real backend adapter. Each method is one call from contracts.ts, followed by a re-sync so the
 * store (the UI's cache) reflects server truth. Granular cache updates can replace sync() later.
 */
const sync = async () => {
  useStore.getState().hydrate(await request(endpoints.sync))
  void useAlerts.getState().refresh() // alerts depend on the same records, so refresh them alongside
}
const id = (v: string) => ({ id: v })

export const httpApi: Api = {
  async login(username, password) {
    const res = await request(endpoints.login, { body: { username, password } })
    tokenStore.set(res.token)
    useStore.getState().setSession(res.user.id)
    await sync()
    return res.user
  },
  async logout() {
    await request(endpoints.logout).catch(() => undefined)
    tokenStore.set(null)
    useStore.getState().setSession(null)
  },
  sync,

  async createCase(body) { const c = await request(endpoints.createCase, { body }); await sync(); return c.id },
  async moveStage(caseId, stage) { await request(endpoints.moveStage, { params: id(caseId), body: { stage } }); await sync() },
  async reassign(caseId, body) { await request(endpoints.reassign, { params: id(caseId), body }); await sync() },

  async createTask(caseId, title) { await request(endpoints.createTask, { params: id(caseId), body: { title } }); await sync() },
  async updateTask(taskId, patch) {
    // { ownerId: undefined } means "clear it", but JSON.stringify drops undefined keys — send null instead.
    const body = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v ?? null])) as UpdateTaskReq
    await request(endpoints.updateTask, { params: id(taskId), body })
    await sync()
  },
  async createNote(caseId, body) { await request(endpoints.createNote, { params: id(caseId), body }); await sync() },
  async createDecision(caseId, body) { await request(endpoints.createDecision, { params: id(caseId), body }); await sync() },
  async uploadDocuments(caseId, files) {
    const form = new FormData()
    files.forEach((f) => form.append('files', f))
    await request(endpoints.uploadDocuments, { params: id(caseId), body: form })
    await sync()
  },
  async askQuestion(caseId, text, handoffId) { await request(endpoints.askQuestion, { params: id(caseId), body: { text, handoffId } }); await sync() },
  async answerQuestion(qid, answer) { await request(endpoints.answerQuestion, { params: id(qid), body: { answer } }); await sync() },

  async submitHandoff(caseId, body) { const h = await request(endpoints.submitHandoff, { params: id(caseId), body }); await sync(); return h.id },
  async setAck(hid, body) { await request(endpoints.setAck, { params: id(hid), body }); await sync() },
  async acceptHandoff(hid) { await request(endpoints.acceptHandoff, { params: id(hid) }); await sync() },
  async rejectHandoff(hid, reason) { await request(endpoints.rejectHandoff, { params: id(hid), body: { reason } }); await sync() },

  async markRead(nid) { await request(endpoints.markRead, { params: id(nid) }); await sync() },
  async markAllRead() { await request(endpoints.markAllRead); await sync() },

  async createEmployee(body) { const r = await request(endpoints.createEmployee, { body }); await sync(); return { id: r.employee.id, tempPassword: r.tempPassword } },
  async updateEmployee(eid, patch) { await request(endpoints.updateEmployee, { params: id(eid), body: patch }); await sync() },

  // Read-only for the UI's cache (the server only appends an audit row), so no re-sync.
  aiHandoffDraft: (caseId, body) => request(endpoints.aiHandoffDraft, { params: id(caseId), body }),
  aiHandoffBrief: (hid) => request(endpoints.aiHandoffBrief, { params: id(hid) }),

  alerts: () => request(endpoints.alerts),
  report: (q) => request(endpoints.report, { query: { ...q } }),
  reportPdfBlob: async (q) => (await fetchFile(endpoints.reportPdf, { ...q })).blob,
  reportPdf: (q) => downloadFile(endpoints.reportPdf, { ...q },
    `thread-report-${q.period === 'year' ? q.year : `${q.year}-${String(q.month).padStart(2, '0')}`}.pdf`),

  async pollDeadlines() { await sync(); return 0 },
  async reportAccessDenied() { /* server already logged the refused request */ },
}
