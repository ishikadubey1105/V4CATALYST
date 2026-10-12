import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download } from 'lucide-react'
import { useStore } from '../store/useStore'
import { Button, PageHeader, Panel, inputClass, tdClass, thClass } from '../components/ui'
import { cn, fmtDateTime } from '../lib/utils'

const actionColor = (a: string) =>
  a === 'handoff.forced' || a === 'access.denied' || a.startsWith('auth.failed') || a === 'auth.blocked' || a === 'deadline.overdue' ? 'text-red-700'
    : a.startsWith('handoff') ? 'text-blue-700'
      : a.startsWith('employee') ? 'text-amber-700' : 'text-zinc-700'

export default function AuditLog() {
  const { audit, employees, cases } = useStore()
  const [caseId, setCaseId] = useState('')
  const [actorId, setActorId] = useState('')
  const [kind, setKind] = useState('')
  const [q, setQ] = useState('')
  const emp = (id: string) => employees.find((u) => u.id === id)
  const caseOf = (id?: string) => cases.find((c) => c.id === id)
  const kinds = [...new Set(audit.map((a) => a.action.split('.')[0]))].sort()

  const rows = useMemo(() => audit
    .filter((a) => (!caseId || a.caseId === caseId) && (!actorId || a.actorId === actorId) && (!kind || a.action.startsWith(kind + '.')))
    .filter((a) => !q || `${a.action} ${a.detail}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.at.localeCompare(a.at)), [audit, caseId, actorId, kind, q])

  const exportCsv = () => {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
    const csv = ['timestamp,actor,action,case,detail', ...rows.map((r) => [r.at, emp(r.actorId)?.name ?? 'System', r.action, caseOf(r.caseId)?.code ?? '', r.detail].map(esc).join(','))].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    Object.assign(document.createElement('a'), { href: url, download: 'audit-log.csv' }).click()
    URL.revokeObjectURL(url)
  }

  const security = audit.filter((a) => ['auth.failed', 'auth.blocked', 'access.denied', 'handoff.forced'].includes(a.action)).length

  return (
    <>
      <PageHeader
        title="Audit log"
        sub={<>Append-only record of every action · {audit.length} entries · <span className={security ? 'text-red-700' : ''}>{security} security-relevant</span></>}
        actions={<Button variant="secondary" onClick={exportCsv}><Download className="size-3.5" />Export CSV ({rows.length})</Button>}
      />
      <Panel>
        <div className="grid gap-2 border-b border-zinc-200 p-2 md:grid-cols-4">
          <input className={inputClass} placeholder="Search detail…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className={inputClass} value={caseId} onChange={(e) => setCaseId(e.target.value)}>
            <option value="">All cases</option>
            {cases.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}
          </select>
          <select className={inputClass} value={actorId} onChange={(e) => setActorId(e.target.value)}>
            <option value="">All actors</option>
            {employees.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            <option value="system">System</option>
          </select>
          <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">All event types</option>
            {kinds.map((k) => <option key={k} value={k}>{k}.*</option>)}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-zinc-50"><tr><th className={thClass}>Timestamp</th><th className={thClass}>Actor</th><th className={thClass}>Event</th><th className={thClass}>Case</th><th className={thClass}>Detail</th></tr></thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((r) => {
                const c = caseOf(r.caseId)
                return (
                  <tr key={r.id} className="hover:bg-zinc-50">
                    <td className={cn(tdClass, 'whitespace-nowrap font-mono text-[11px] text-zinc-500')}>{fmtDateTime(r.at)}</td>
                    <td className={cn(tdClass, 'whitespace-nowrap')}>{emp(r.actorId)?.name ?? <span className="text-zinc-500">System</span>}</td>
                    <td className={cn(tdClass, 'whitespace-nowrap font-mono text-[11px] font-medium', actionColor(r.action))}>{r.action}</td>
                    <td className={cn(tdClass, 'whitespace-nowrap')}>{c ? <Link to={`/cases/${c.id}?tab=history`} className="font-mono text-xs text-blue-700 hover:underline">{c.code}</Link> : <span className="text-zinc-400">—</span>}</td>
                    <td className={cn(tdClass, 'text-zinc-700')}>{r.detail}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  )
}
