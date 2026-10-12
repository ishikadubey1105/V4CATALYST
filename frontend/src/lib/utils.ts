import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { differenceInHours, format, formatDistanceToNowStrict, isPast, parseISO } from 'date-fns'
import type { HandoffReason, OrgRole, Task } from './types'

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

export const uid = (prefix = '') => prefix + Math.random().toString(36).slice(2, 9)

export const ago = (iso: string) => formatDistanceToNowStrict(parseISO(iso), { addSuffix: true })
export const fmtDate = (iso: string) => format(parseISO(iso), 'dd MMM yyyy')
export const fmtDateTime = (iso: string) => format(parseISO(iso), 'dd MMM yyyy, HH:mm')

export type DueState = 'done' | 'none' | 'overdue' | 'soon' | 'ok'

/** "Soon" means due within the next 48 hours. */
export function dueState(task: Pick<Task, 'due' | 'done'>): DueState {
  if (task.done) return 'done'
  if (!task.due) return 'none'
  const due = parseISO(task.due)
  if (isPast(due)) return 'overdue'
  if (differenceInHours(due, new Date()) <= 48) return 'soon'
  return 'ok'
}

export const formatBytes = (n: number) =>
  n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`

export const orgRoleLabel: Record<OrgRole, string> = { employee: 'Employee', admin: 'Admin', auditor: 'Auditor' }

export const reasonLabel: Record<HandoffReason, string> = {
  leave: 'Planned leave / absence',
  reassignment: 'Role change or reassignment',
  escalation: 'Escalation to senior staff',
  expertise: 'Needs specific expertise',
  workload: 'Workload balancing',
  other: 'Other',
}

export const initials = (name: string) =>
  name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()

/** Avatar colours from the olive / sand / brown palette, stable per person (the stored tone predates the palette). */
const avatarTones = [
  'bg-blue-100 text-blue-900',
  'bg-[#ecd8bd] text-[#5a3a1c]',
  'bg-zinc-200 text-zinc-800',
  'bg-blue-200 text-blue-950',
  'bg-[#e3cdb0] text-[#4a3018]',
  'bg-[#e8e9d3] text-[#3f4720]',
]
export const avatarTone = (id: string) =>
  avatarTones[[...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % avatarTones.length]
