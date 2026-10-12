import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useMe, useRelations, useStore, type NewEmployee } from '../store/useStore'
import { API_MODE, API_BASE } from '../api/client'
import { api, endpoints, useAction } from '../api'
import { caseRole } from '../lib/permissions'
import { Button, Field, Label, Modal, PageHeader, Panel, PanelHeader, Person, StageLabel, Tabs, inputClass, tdClass, thClass } from '../components/ui'
import { cn, dueState, orgRoleLabel } from '../lib/utils'
import type { CaseRole, OrgRole } from '../lib/types'

type TabKey = 'employees' | 'matrix' | 'cases' | 'api'

/** Central management: employee directory, access levels, and who holds which role on which case. */
export default function AdminConsole() {
  const me = useMe()!
  const s = useStore()
  const rel = useRelations()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as TabKey) || 'employees'
  const [adding, setAdding] = useState(false)
  const { run } = useAction()

  return (
    <>
      <PageHeader
        title="Admin console"
        sub="Employee directory, access levels and case responsibility across the organisation"
        actions={<Button onClick={() => setAdding(true)}><Plus className="size-3.5" />Add employee</Button>}
      />
      <Tabs value={tab} onChange={(t) => setParams({ tab: t })} items={[
        { key: 'employees', label: 'Employees', count: s.employees.length },
        { key: 'matrix', label: 'Responsibility matrix' },
        { key: 'cases', label: 'All cases', count: s.cases.length },
        { key: 'api', label: 'API integration', count: Object.keys(endpoints).length },
      ]} />

      <div className="mt-4">
        {tab === 'employees' && (
          <Panel>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className={thClass}>Employee</th><th className={thClass}>Username</th><th className={thClass}>Department</th>
                    <th className={thClass}>Access level</th><th className={thClass}>Owns</th><th className={thClass}>Open tasks</th>
                    <th className={thClass}>Sign-in</th><th className={thClass}>Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {s.employees.map((u) => {
                    const self = u.id === me.id
                    const owns = s.cases.filter((c) => c.ownerId === u.id && c.stage !== 'resolved').length
                    const open = s.tasks.filter((t) => t.ownerId === u.id && !t.done)
                    const overdue = open.filter((t) => dueState(t) === 'overdue').length
                    const fails = s.failedLogins[u.username] ?? 0
                    return (
                      <tr key={u.id} className={cn(!u.active && 'bg-zinc-50 text-zinc-500')}>
                        <td className={tdClass}><Person user={u} sub={u.title} size="xs" /></td>
                        <td className={cn(tdClass, 'font-mono text-xs')}>@{u.username}<div className="text-[11px] text-zinc-500">{u.email}</div></td>
                        <td className={tdClass}>{u.department}</td>
                        <td className={tdClass}>
                          <select className={cn(inputClass, 'w-32 py-1')} value={u.orgRole} disabled={self}
                            onChange={(e) => run(() => api.updateEmployee(u.id, { orgRole: e.target.value as OrgRole }), { tone: 'info', title: `${u.name} is now ${orgRoleLabel[e.target.value as OrgRole]}` })}>
                            {(['employee', 'admin', 'auditor'] as OrgRole[]).map((r) => <option key={r} value={r}>{orgRoleLabel[r]}</option>)}
                          </select>
                        </td>
                        <td className={cn(tdClass, 'font-mono text-xs')}>{owns}</td>
                        <td className={cn(tdClass, 'font-mono text-xs')}>{open.length}{overdue > 0 && <span className="ml-1 text-red-700">({overdue} overdue)</span>}</td>
                        <td className={tdClass}>{fails >= 5 ? <Label tone="red">Locked</Label> : fails > 0 ? <span className="font-mono text-xs text-amber-700">{fails} failed</span> : <span className="text-xs text-zinc-400">OK</span>}</td>
                        <td className={tdClass}>
                          <Button size="sm" variant={u.active ? 'secondary' : 'primary'} disabled={self}
                            onClick={() => run(() => api.updateEmployee(u.id, { active: fails >= 5 ? true : !u.active }))}>
                            {u.active ? (fails >= 5 ? 'Unlock' : 'Disable') : 'Enable'}
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="border-t border-zinc-200 px-4 py-2 text-[11px] text-zinc-500">
              Access level is organisation-wide. Owner / receiver / assignee roles are not set here — they come from each case's records (see the matrix).
              Disabling an account blocks sign-in but keeps its history. You cannot change your own access.
            </p>
          </Panel>
        )}

        {tab === 'matrix' && <Matrix />}
        {tab === 'api' && <Integration />}

        {tab === 'cases' && (
          <Panel>
            <table className="w-full text-[13px]">
              <thead className="bg-zinc-50"><tr><th className={thClass}>Case</th><th className={thClass}>Stage</th><th className={thClass}>Owner</th><th className={thClass}>Pending forward</th></tr></thead>
              <tbody className="divide-y divide-zinc-100">
                {s.cases.map((c) => {
                  const h = rel.handoffs.find((x) => x.caseId === c.id && x.status === 'submitted')
                  const owner = s.employees.find((u) => u.id === c.ownerId)
                  return (
                    <tr key={c.id} className="hover:bg-zinc-50">
                      <td className={tdClass}><Link to={`/cases/${c.id}`} className="hover:underline"><span className="mr-2 font-mono text-xs text-zinc-500">{c.code}</span>{c.title}</Link></td>
                      <td className={tdClass}><StageLabel stage={c.stage} /></td>
                      <td className={tdClass}><Person user={owner} size="xs" />{owner && !owner.active && <Label tone="red" className="ml-2">disabled</Label>}</td>
                      <td className={tdClass}>{h ? <Link to={`/handoffs/${h.id}`} className="text-xs text-blue-700 hover:underline">→ {s.employees.find((u) => u.id === h.toId)?.name}</Link> : <span className="text-zinc-400">—</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="border-t border-zinc-200 px-4 py-2 text-[11px] text-zinc-500">Use "Reassign (admin)" on a case page to move ownership with a logged reason — e.g. when the owner is disabled.</p>
          </Panel>
        )}
      </div>

      <AddEmployeeModal open={adding} onClose={() => setAdding(false)} />
    </>
  )
}

const cellCode: Partial<Record<CaseRole, [string, string]>> = {
  owner: ['O', 'bg-blue-600 text-white'],
  receiver: ['R', 'bg-red-600 text-white'],
  assignee: ['A', 'bg-amber-400 text-amber-950'],
  previous_owner: ['P', 'bg-zinc-200 text-zinc-700'],
}

function Matrix() {
  const s = useStore()
  const rel = useRelations()
  const staff = s.employees.filter((u) => u.orgRole !== 'auditor')
  return (
    <Panel>
      <PanelHeader
        title="Responsibility matrix"
        sub="Who holds which role on each complaint, derived live from case records"
        action={<div className="flex gap-3 text-[11px] text-zinc-600">{Object.entries(cellCode).map(([k, [code, cls]]) => <span key={k} className="flex items-center gap-1"><span className={cn('grid size-4 place-items-center rounded-sm font-mono text-[10px] font-semibold', cls)}>{code}</span>{k.replace('_', ' ')}</span>)}</div>}
      />
      <div className="overflow-x-auto">
        <table className="text-[13px]">
          <thead className="bg-zinc-50">
            <tr>
              <th className={cn(thClass, 'sticky left-0 bg-zinc-50')}>Employee</th>
              {s.cases.map((c) => <th key={c.id} className={cn(thClass, 'text-center')}><Link to={`/cases/${c.id}`} className="font-mono normal-case hover:underline" title={c.title}>{c.code}</Link></th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {staff.map((u) => (
              <tr key={u.id}>
                <td className={cn(tdClass, 'sticky left-0 whitespace-nowrap bg-white')}><Person user={u} sub={u.department} size="xs" /></td>
                {s.cases.map((c) => {
                  // Evaluate as if the user were a plain employee so admin rights don't mask real case roles.
                  const r = caseRole({ ...u, orgRole: 'employee' }, c, rel)
                  const code = cellCode[r]
                  return (
                    <td key={c.id} className="border-l border-zinc-100 px-3 py-2 text-center">
                      {code ? <span title={`${u.name}: ${r.replace('_', ' ')} on ${c.code}`} className={cn('inline-grid size-6 place-items-center rounded-sm font-mono text-[11px] font-semibold', code[1])}>{code[0]}</span> : <span className="text-zinc-300">·</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

function AddEmployeeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { run, pending } = useAction()
  const blank: NewEmployee = { username: '', name: '', email: '', department: '', title: '', orgRole: 'employee' }
  const [form, setForm] = useState<NewEmployee>(blank)
  const [issued, setIssued] = useState<{ username: string; password: string } | null>(null)
  const set = (k: keyof NewEmployee) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })
  const valid = form.name.trim().length > 2 && /^[a-z][a-z0-9._-]{2,}$/.test(form.username) && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email) && form.department.trim() && form.title.trim()
  const close = () => { setIssued(null); setForm(blank); onClose() }

  return (
    <Modal open={open} onClose={close} title={issued ? 'Account created' : 'Add employee'}
      footer={issued ? <Button onClick={close}>Done</Button> : <>
        <Button variant="secondary" onClick={close}>Cancel</Button>
        <Button disabled={!valid || pending} onClick={async () => {
          const res = await run(() => api.createEmployee({ ...form, name: form.name.trim(), email: form.email.trim().toLowerCase() }))
          if (res) setIssued({ username: form.username, password: res.tempPassword })
        }}>Create account</Button>
      </>}>
      {issued ? (
        <div className="space-y-3 text-[13px]">
          <p>Give these one-time credentials to the employee. The password is shown only once.</p>
          <div className="grid grid-cols-[100px_1fr] gap-y-1 rounded border border-zinc-300 bg-zinc-50 p-3 font-mono text-xs">
            <span className="text-zinc-500">username</span><span>{issued.username}</span>
            <span className="text-zinc-500">password</span><span>{issued.password}</span>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name"><input className={inputClass} value={form.name} onChange={set('name')} /></Field>
          <Field label="Username" hint="lowercase, used to sign in"><input className={cn(inputClass, 'font-mono')} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })} placeholder="firstname.lastname" /></Field>
          <Field label="Work email"><input className={inputClass} value={form.email} onChange={set('email')} placeholder="name@corp.local" /></Field>
          <Field label="Department"><input className={inputClass} value={form.department} onChange={set('department')} /></Field>
          <Field label="Job title"><input className={inputClass} value={form.title} onChange={set('title')} /></Field>
          <Field label="Access level" hint="organisation-wide">
            <select className={inputClass} value={form.orgRole} onChange={set('orgRole')}>
              <option value="employee">Employee</option>
              <option value="admin">Admin</option>
              <option value="auditor">Auditor (read-only)</option>
            </select>
          </Field>
        </div>
      )}
    </Modal>
  )
}

/** Live view of src/api/contracts.ts — each row pairs a UI component with the backend route it calls. */
function Integration() {
  const rows = Object.entries(endpoints)
  const methodCls = { GET: 'text-green-700 border-green-300', POST: 'text-blue-700 border-blue-300', PATCH: 'text-amber-700 border-amber-300' }
  return (
    <Panel>
      <PanelHeader
        title="Frontend ↔ backend contract"
        sub="Generated from src/api/contracts.ts. The backend implements these routes; the UI never calls anything else."
        action={<span className="font-mono text-[11px] text-zinc-600">mode: <b>{API_MODE}</b>{API_MODE === 'http' && <> · base: {API_BASE}</>}</span>}
      />
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="bg-zinc-50">
            <tr><th className={thClass}>Endpoint</th><th className={thClass}>Request → Response</th><th className={thClass}>Called from</th><th className={thClass}>Errors</th></tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map(([key, e]) => (
              <tr key={key} className="align-top">
                <td className={tdClass}>
                  <div className="flex items-center gap-2">
                    <span className={cn('w-12 rounded-sm border text-center font-mono text-[10px] font-semibold', methodCls[e.method])}>{e.method}</span>
                    <code className="font-mono text-xs">{e.path}</code>
                  </div>
                  <div className="mt-0.5 pl-14 text-[11px] text-zinc-500">api.{key}() — {e.desc}</div>
                </td>
                <td className={cn(tdClass, 'whitespace-nowrap font-mono text-[11px]')}>{e.req} <span className="text-zinc-400">→</span> {e.res}</td>
                <td className={cn(tdClass, 'text-xs text-zinc-700')}>{e.usedBy.join(', ')}</td>
                <td className={tdClass}>{'errors' in e && e.errors ? <div className="flex flex-wrap gap-1">{e.errors.map((x) => <span key={x} className="rounded-sm bg-zinc-100 px-1 font-mono text-[10px] text-zinc-700">{x}</span>)}</div> : <span className="text-zinc-400">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-zinc-200 px-4 py-2 text-[11px] text-zinc-500">
        Switch to the real backend with <code className="font-mono">VITE_API_MODE=http</code> and <code className="font-mono">VITE_API_BASE_URL</code>. Auth: <code className="font-mono">Authorization: Bearer &lt;token&gt;</code> from /auth/login. Errors: <code className="font-mono">{'{ code, message }'}</code> JSON body.
      </p>
    </Panel>
  )
}
