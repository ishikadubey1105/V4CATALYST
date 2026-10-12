import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { useMe, useStore, type NewCase } from '../store/useStore'
import { api, useAction } from '../api'
import { useEmployee, useVisibleCases } from '../lib/hooks'
import { stages } from '../lib/permissions'
import {
  Button, Empty, Field, Modal, PageHeader, Panel, Person, PriorityLabel, RoleLabel, StageLabel, inputClass, tdClass, thClass,
} from '../components/ui'
import { cn, dueState, fmtDate } from '../lib/utils'
import type { CaseRole, Channel, Priority, Stage } from '../lib/types'

export default function CasesList() {
  const me = useMe()!
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tasks = useStore((s) => s.tasks)
  const emp = useEmployee()
  const visible = useVisibleCases()
  const [q, setQ] = useState('')
  const [stage, setStage] = useState<Stage | ''>('')
  const [role, setRole] = useState<CaseRole | ''>('')
  const creating = params.get('new') === '1'

  const rows = useMemo(() => visible.filter((c) => {
    if (stage && c.stage !== stage) return false
    if (role && c.role !== role) return false
    const t = q.toLowerCase()
    return !t || [c.title, c.code, c.complainant, c.category].some((s) => s.toLowerCase().includes(t))
  }), [visible, q, stage, role])

  const roles = [...new Set(visible.map((c) => c.role))]

  return (
    <>
      <PageHeader
        title="Case register"
        sub={me.orgRole === 'employee' ? `${visible.length} cases you are connected to` : `${visible.length} cases in the organisation`}
        actions={me.orgRole !== 'auditor' && <Button onClick={() => setParams({ new: '1' })}><Plus className="size-3.5" />Register complaint</Button>}
      />

      <Panel>
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 p-2">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-zinc-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search code, title, complainant" className={cn(inputClass, 'pl-8')} />
          </div>
          <select className={cn(inputClass, 'w-auto')} value={stage} onChange={(e) => setStage(e.target.value as Stage | '')}>
            <option value="">All stages</option>
            {stages.map((s, i) => <option key={s.key} value={s.key}>{i + 1}. {s.label}</option>)}
          </select>
          <select className={cn(inputClass, 'w-auto')} value={role} onChange={(e) => setRole(e.target.value as CaseRole | '')}>
            <option value="">Any role</option>
            {roles.map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
          </select>
          <span className="ml-auto pr-2 text-xs text-zinc-500">{rows.length} shown</span>
        </div>
        {rows.length === 0 ? <Empty title="No cases match these filters" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-zinc-50">
                <tr>
                  <th className={thClass}>Code</th><th className={thClass}>Complaint</th><th className={thClass}>Priority</th><th className={thClass}>Stage</th>
                  <th className={thClass}>Owner</th><th className={thClass}>My role</th><th className={thClass}>Open tasks</th><th className={thClass}>Received</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map((c) => {
                  const open = tasks.filter((t) => t.caseId === c.id && !t.done)
                  const overdue = open.filter((t) => dueState(t) === 'overdue').length
                  return (
                    <tr key={c.id} onClick={() => navigate(`/cases/${c.id}`)} className="cursor-pointer hover:bg-zinc-50">
                      <td className={cn(tdClass, 'font-mono text-xs text-zinc-600')}>{c.code}</td>
                      <td className={tdClass}>
                        <div className="max-w-md truncate font-medium">{c.title}</div>
                        <div className="text-[11px] text-zinc-500">{c.complainant} · {c.channel} · {c.category}</div>
                      </td>
                      <td className={tdClass}><PriorityLabel priority={c.priority} /></td>
                      <td className={tdClass}><StageLabel stage={c.stage} /></td>
                      <td className={tdClass}><Person user={emp(c.ownerId)} size="xs" /></td>
                      <td className={tdClass}><RoleLabel role={c.role} /></td>
                      <td className={cn(tdClass, 'font-mono text-xs')}>{open.length}{overdue > 0 && <span className="ml-1.5 text-red-700">({overdue} overdue)</span>}</td>
                      <td className={cn(tdClass, 'font-mono text-xs text-zinc-500')}>{fmtDate(c.receivedAt)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <RegisterModal open={creating} onClose={() => setParams({})} />
    </>
  )
}

const channels: Channel[] = ['Email', 'Phone', 'Web form', 'Branch', 'Social']
const categories = ['Delivery', 'Billing', 'Product quality', 'Service', 'Privacy', 'Other']

function RegisterModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const me = useMe()!
  const employees = useStore((s) => s.employees)
  const { run, pending } = useAction()
  const navigate = useNavigate()
  const blank: NewCase = { title: '', complainant: '', channel: 'Email', category: 'Delivery', priority: 'medium', summary: '', ownerId: me.id }
  const [form, setForm] = useState<NewCase>(blank)
  const set = <K extends keyof NewCase>(k: K) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value as NewCase[K] })
  const valid = form.title.trim().length >= 5 && form.complainant.trim() && form.summary.trim().length >= 20
  const owners = employees.filter((u) => u.active && u.orgRole !== 'auditor')

  return (
    <Modal
      open={open} onClose={onClose} title="Register a complaint" width="max-w-xl"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button disabled={!valid || pending} onClick={async () => {
          const id = await run(
            () => api.createCase({ ...form, title: form.title.trim(), complainant: form.complainant.trim(), summary: form.summary.trim() }),
            { tone: 'success', title: 'Complaint registered', body: form.ownerId === me.id ? 'You are the owner.' : `${employees.find((u) => u.id === form.ownerId)?.name} has been notified.` },
          )
          if (id) { setForm(blank); onClose(); navigate(`/cases/${id}`) }
        }}>Register</Button>
      </>}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Field label="Complaint title" hint="min. 5 characters"><input className={inputClass} value={form.title} onChange={set('title')} placeholder="e.g. Refund not received after return" /></Field></div>
        <Field label="Complainant"><input className={inputClass} value={form.complainant} onChange={set('complainant')} placeholder="Customer or organisation" /></Field>
        <Field label="Received via">
          <select className={inputClass} value={form.channel} onChange={set('channel')}>{channels.map((c) => <option key={c}>{c}</option>)}</select>
        </Field>
        <Field label="Category">
          <select className={inputClass} value={form.category} onChange={set('category')}>{categories.map((c) => <option key={c}>{c}</option>)}</select>
        </Field>
        <Field label="Priority">
          <select className={inputClass} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}>
            <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
          </select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Case owner" hint="the employee accountable for this complaint">
            <select className={inputClass} value={form.ownerId} onChange={set('ownerId')}>
              {owners.map((u) => <option key={u.id} value={u.id}>{u.name} — {u.department}{u.id === me.id ? ' (me)' : ''}</option>)}
            </select>
          </Field>
        </div>
        <div className="sm:col-span-2"><Field label="Summary" hint="min. 20 characters"><textarea className={inputClass} rows={3} value={form.summary} onChange={set('summary')} placeholder="What happened, what does the complainant want, what has been done so far?" /></Field></div>
      </div>
    </Modal>
  )
}
