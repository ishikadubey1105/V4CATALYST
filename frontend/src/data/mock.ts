import { addDays, subDays, subHours, addHours, endOfDay } from 'date-fns'
import type {
  AuditEvent, Case, ContextNote, Decision, Doc, Employee, Handoff, Notification, OwnershipEntry, Question, Task,
} from '../lib/types'

// Seed rows for the client-side "database". Dates are relative to now so due/overdue states always look right.
const now = new Date()
const iso = (d: Date) => d.toISOString()
const day = (n: number) => iso(endOfDay(addDays(now, n)))

export const employees: Employee[] = [
  { id: 'e1', username: 'asha.rao', name: 'Asha Rao', email: 'asha.rao@corp.local', department: 'Customer Relations', title: 'Senior Associate', orgRole: 'employee', active: true, tone: 'bg-sky-100 text-sky-900' },
  { id: 'e2', username: 'ravi.menon', name: 'Ravi Menon', email: 'ravi.menon@corp.local', department: 'Customer Relations', title: 'Associate', orgRole: 'employee', active: true, tone: 'bg-amber-100 text-amber-900' },
  { id: 'e3', username: 'meera.iyer', name: 'Meera Iyer', email: 'meera.iyer@corp.local', department: 'Operations', title: 'Operations Lead', orgRole: 'admin', active: true, tone: 'bg-emerald-100 text-emerald-900' },
  { id: 'e4', username: 'arjun.shah', name: 'Arjun Shah', email: 'arjun.shah@corp.local', department: 'Risk & Audit', title: 'Risk and Audit Lead', orgRole: 'admin', active: true, tone: 'bg-stone-200 text-stone-900' },
  { id: 'e5', username: 'neha.kulkarni', name: 'Neha Kulkarni', email: 'neha.kulkarni@corp.local', department: 'Compliance', title: 'Compliance Officer', orgRole: 'employee', active: true, tone: 'bg-rose-100 text-rose-900' },
  { id: 'e6', username: 'karan.joshi', name: 'Karan Joshi', email: 'karan.joshi@corp.local', department: 'Logistics', title: 'Logistics Coordinator', orgRole: 'employee', active: true, tone: 'bg-indigo-100 text-indigo-900' },
]

/**
 * Mock credential table (username → password). In production this lives only in the backend as salted hashes;
 * the frontend never sees it. Fixed accounts: 4 employees + 2 admins.
 */
export const credentials: Record<string, string> = {
  'asha.rao': 'Asha@2026',
  'ravi.menon': 'Ravi@2026',
  'neha.kulkarni': 'Neha@2026',
  'karan.joshi': 'Karan@2026',
  'meera.iyer': 'Meera@Admin26',
  'arjun.shah': 'Arjun@Admin26',
}

export const cases: Case[] = [
  {
    id: 'c1', code: 'CMP-1042', title: 'Repeated late deliveries to Nimbus Retail stores', complainant: 'Nimbus Retail (B2B)', channel: 'Email', category: 'Delivery',
    priority: 'high', stage: 'investigation', ownerId: 'e1', createdBy: 'e5', receivedAt: iso(subDays(now, 21)), updatedAt: iso(subHours(now, 3)),
    summary: 'Three Nimbus stores report deliveries arriving 1–2 days late for six weeks. Root cause looks like a routing rule change in the carrier system. Customer has asked for a written remediation plan and a goodwill credit.',
  },
  {
    id: 'c2', code: 'CMP-1038', title: 'Data access request not fulfilled within 30 days', complainant: 'Private individual', channel: 'Web form', category: 'Privacy',
    priority: 'high', stage: 'handoff', prevStage: 'action', ownerId: 'e5', createdBy: 'e5', receivedAt: iso(subDays(now, 33)), updatedAt: iso(subHours(now, 6)),
    summary: 'Customer filed a subject access request; the statutory deadline was missed by 3 days. Records have been collected from 4 of 5 systems. The CRM export is still outstanding.',
  },
  {
    id: 'c3', code: 'CMP-1031', title: 'Duplicate charge on corporate invoice', complainant: 'Orbit Cloud Pvt Ltd', channel: 'Phone', category: 'Billing',
    priority: 'medium', stage: 'action', ownerId: 'e1', createdBy: 'e1', receivedAt: iso(subDays(now, 9)), updatedAt: iso(subDays(now, 1)),
    summary: 'Invoice INV-77120 charged twice for September. Finance confirmed the duplicate; refund approved and awaiting payment run.',
  },
  {
    id: 'c4', code: 'CMP-1027', title: 'Goods damaged on arrival — Pune warehouse', complainant: 'Kaveri Traders', channel: 'Branch', category: 'Product quality',
    priority: 'low', stage: 'action', ownerId: 'e2', createdBy: 'e5', receivedAt: iso(subDays(now, 50)), updatedAt: iso(subDays(now, 2)),
    summary: 'Two pallets arrived with crushed packaging. Photos and carrier report collected. Replacement shipped; carrier claim in progress.',
  },
  {
    id: 'c5', code: 'CMP-1019', title: 'Complaint about staff conduct at Pune branch', complainant: 'Walk-in customer', channel: 'Branch', category: 'Service',
    priority: 'high', stage: 'investigation', ownerId: 'e5', createdBy: 'e2', receivedAt: iso(subDays(now, 14)), updatedAt: iso(subHours(now, 20)),
    summary: 'Customer reports being refused service and spoken to rudely. CCTV request raised. Branch manager statement pending.',
  },
  {
    id: 'c6', code: 'CMP-1012', title: 'Refund not received after return', complainant: 'Online customer', channel: 'Social', category: 'Billing',
    priority: 'medium', stage: 'resolved', ownerId: 'e6', createdBy: 'e6', receivedAt: iso(subDays(now, 40)), updatedAt: iso(subDays(now, 12)),
    summary: 'Refund was stuck due to a failed bank transfer. Re-issued and confirmed received by the customer.',
  },
]

export const notes: ContextNote[] = [
  { id: 'n1', caseId: 'c1', title: 'What the customer wants', body: 'A written remediation plan by end of month and a credit for the six affected weeks. Tone has been firm but cooperative.', by: 'e1', at: iso(subDays(now, 12)) },
  { id: 'n2', caseId: 'c1', title: 'Key contacts', body: 'Priya Desai (Nimbus regional ops). Carrier contact: dispatch desk at FastRoute.', by: 'e1', at: iso(subDays(now, 9)) },
  { id: 'n3', caseId: 'c2', title: 'Systems involved', body: 'Billing, CRM, support desk, marketing platform, call recordings. Only CRM remains.', by: 'e5', at: iso(subDays(now, 20)) },
  { id: 'n4', caseId: 'c3', title: 'Refund path', body: 'Refund is via the weekly payment run (Thursdays).', by: 'e1', at: iso(subDays(now, 5)) },
  { id: 'n5', caseId: 'c5', title: 'Sensitivity', body: 'HR is aware. Do not share staff names with the complainant.', by: 'e5', at: iso(subDays(now, 3)) },
]

export const decisions: Decision[] = [
  { id: 'd1', caseId: 'c1', title: 'Offer a 10% credit on affected invoices', rationale: 'Approved by Operations; in line with the delivery SLA policy.', by: 'e3', at: iso(subDays(now, 10)) },
  { id: 'd2', caseId: 'c1', title: 'Carrier to roll back the routing rule', rationale: 'Rule change coincides exactly with the start of delays.', by: 'e1', at: iso(subDays(now, 6)) },
  { id: 'd3', caseId: 'c2', title: 'Notify the customer of the delay in writing', rationale: 'Required by policy once the statutory deadline is missed.', by: 'e5', at: iso(subDays(now, 8)) },
  { id: 'd4', caseId: 'c3', title: 'Refund in full, no offset', rationale: 'Error was ours; customer has a clean payment record.', by: 'e1', at: iso(subDays(now, 6)) },
  { id: 'd5', caseId: 'c5', title: 'Escalate to HR before replying', rationale: 'Conduct complaints follow the HR protocol.', by: 'e3', at: iso(subDays(now, 2)) },
  { id: 'd6', caseId: 'c4', title: 'Ship replacement before the claim settles', rationale: 'Long-standing customer; claim is low value.', by: 'e5', at: iso(subDays(now, 25)) },
]

export const docs: Doc[] = [
  { id: 'f1', caseId: 'c1', name: 'Nimbus_complaint_email.pdf', kind: 'pdf', size: 240_000, by: 'e5', at: iso(subDays(now, 21)) },
  { id: 'f2', caseId: 'c1', name: 'Delivery_log_6_weeks.xlsx', kind: 'sheet', size: 312_000, by: 'e1', at: iso(subDays(now, 11)) },
  { id: 'f3', caseId: 'c1', name: 'Remediation_plan_draft.docx', kind: 'doc', size: 96_000, by: 'e1', at: iso(subDays(now, 4)) },
  { id: 'f4', caseId: 'c2', name: 'SAR_request_form.pdf', kind: 'pdf', size: 120_000, by: 'e5', at: iso(subDays(now, 33)) },
  { id: 'f5', caseId: 'c2', name: 'Records_collected.xlsx', kind: 'sheet', size: 88_000, by: 'e5', at: iso(subDays(now, 3)) },
  { id: 'f6', caseId: 'c3', name: 'INV-77120.pdf', kind: 'pdf', size: 150_000, by: 'e1', at: iso(subDays(now, 9)) },
  { id: 'f7', caseId: 'c4', name: 'Damage_photos.png', kind: 'image', size: 3_400_000, by: 'e2', at: iso(subDays(now, 48)) },
]

export const tasks: Task[] = [
  // c1 is deliberately incomplete so the demo forward gets blocked
  { id: 't1', caseId: 'c1', title: 'Confirm routing rule rollback with carrier', ownerId: 'e6', due: day(2), done: false },
  { id: 't2', caseId: 'c1', title: 'Send remediation plan to Nimbus', due: day(5), done: false },
  { id: 't3', caseId: 'c1', title: 'Raise credit note for affected invoices', ownerId: 'e1', done: false },
  { id: 't4', caseId: 'c1', title: 'Pull six weeks of delivery logs', ownerId: 'e6', due: day(-6), done: true },
  { id: 't5', caseId: 'c2', title: 'Export CRM records for the requester', ownerId: 'e5', due: day(1), done: false },
  { id: 't6', caseId: 'c2', title: 'Send final response pack', ownerId: 'e5', due: day(4), done: false },
  { id: 't7', caseId: 'c3', title: 'Confirm refund in Thursday payment run', ownerId: 'e1', due: iso(addHours(now, 20)), done: false },
  { id: 't8', caseId: 'c3', title: 'Send apology letter', ownerId: 'e2', due: day(9), done: false },
  { id: 't9', caseId: 'c5', title: 'Collect branch manager statement', ownerId: 'e5', due: iso(subDays(now, 1)), done: false },
  { id: 't10', caseId: 'c5', title: 'Obtain CCTV footage', ownerId: 'e6', due: iso(subDays(now, 2)), done: false },
  { id: 't11', caseId: 'c4', title: 'File carrier damage claim', ownerId: 'e2', due: day(6), done: false },
]

export const questions: Question[] = [
  { id: 'q1', caseId: 'c1', by: 'e3', text: 'Has the carrier confirmed the rollback date in writing?', at: iso(subDays(now, 1)) },
  { id: 'q2', caseId: 'c2', handoffId: 'h1', by: 'e2', text: 'Who is the contact in the CRM team for the export?', at: iso(subHours(now, 4)), answer: 'Dev in CRM support — ticket CRM-4471 is already open.', answeredBy: 'e5' },
]

export const handoffs: Handoff[] = [
  {
    id: 'h1', caseId: 'c2', fromId: 'e5', toId: 'e2', reason: 'leave', reasonNote: 'Going on planned leave for two weeks from Monday.', status: 'submitted', createdAt: iso(subHours(now, 6)),
    summary: 'Only the CRM export and the final response pack remain. The requester has been told about the delay. Ticket CRM-4471 tracks the export.',
    acks: { overview: false, context: false, documents: false, actions: false, questions: false },
  },
  {
    id: 'h0', caseId: 'c4', fromId: 'e5', toId: 'e2', reason: 'expertise', reasonNote: 'Ravi handles the carrier relationship for Pune.', status: 'accepted', createdAt: iso(subDays(now, 9)), decidedAt: iso(subDays(now, 8)),
    summary: 'Replacement shipped; claim remaining.',
    acks: { overview: true, context: true, documents: true, actions: true, questions: true },
  },
]

export const ownership: OwnershipEntry[] = [
  { caseId: 'c1', userId: 'e5', from: iso(subDays(now, 21)), to: iso(subDays(now, 14)), via: 'created' },
  { caseId: 'c1', userId: 'e1', from: iso(subDays(now, 14)), via: 'handoff', reason: 'Workload: Customer Relations owns B2B delivery complaints' },
  { caseId: 'c2', userId: 'e5', from: iso(subDays(now, 33)), via: 'created' },
  { caseId: 'c3', userId: 'e1', from: iso(subDays(now, 9)), via: 'created' },
  { caseId: 'c4', userId: 'e5', from: iso(subDays(now, 50)), to: iso(subDays(now, 8)), via: 'created' },
  { caseId: 'c4', userId: 'e2', from: iso(subDays(now, 8)), via: 'handoff', reason: 'Expertise: Ravi handles the carrier relationship for Pune.' },
  { caseId: 'c5', userId: 'e5', from: iso(subDays(now, 14)), via: 'created' },
  { caseId: 'c6', userId: 'e6', from: iso(subDays(now, 40)), via: 'created' },
]

export const notifications: Notification[] = [
  { id: 'nt1', userId: 'e2', kind: 'handoff', title: 'Case forwarded to you', body: 'Neha Kulkarni forwarded CMP-1038 · Reason: planned leave', at: iso(subHours(now, 6)), read: false, link: '/handoffs/h1' },
  { id: 'nt2', userId: 'e1', kind: 'question', title: 'New question on CMP-1042', body: 'Meera Iyer: Has the carrier confirmed the rollback date in writing?', at: iso(subDays(now, 1)), read: false, link: '/cases/c1?tab=context' },
]

export const audit: AuditEvent[] = [
  { id: 'a1', at: iso(subDays(now, 21)), actorId: 'e5', action: 'case.created', caseId: 'c1', detail: 'Registered CMP-1042 from Email' },
  { id: 'a2', at: iso(subDays(now, 14)), actorId: 'e1', action: 'handoff.accepted', caseId: 'c1', detail: 'Ownership Neha Kulkarni → Asha Rao (workload)' },
  { id: 'a3', at: iso(subDays(now, 9)), actorId: 'e5', action: 'handoff.submitted', caseId: 'c4', detail: 'Forwarded to Ravi Menon · expertise · score 100%' },
  { id: 'a4', at: iso(subDays(now, 8)), actorId: 'e2', action: 'handoff.accepted', caseId: 'c4', detail: 'All 5 sections acknowledged' },
  { id: 'a5', at: iso(subDays(now, 10)), actorId: 'e3', action: 'decision.added', caseId: 'c1', detail: 'Offer a 10% credit on affected invoices' },
  { id: 'a6', at: iso(subHours(now, 6)), actorId: 'e5', action: 'handoff.submitted', caseId: 'c2', detail: 'Forwarded to Ravi Menon · leave · score 100%' },
  { id: 'a7', at: iso(subHours(now, 4)), actorId: 'e2', action: 'question.asked', caseId: 'c2', detail: 'Who is the contact in the CRM team for the export?' },
  { id: 'a8', at: iso(subHours(now, 3)), actorId: 'e5', action: 'question.answered', caseId: 'c2', detail: 'Dev in CRM support — ticket CRM-4471 is already open.' },
  { id: 'a9', at: iso(subDays(now, 12)), actorId: 'e6', action: 'stage.changed', caseId: 'c6', detail: 'action → resolved' },
]
