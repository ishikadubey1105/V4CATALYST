import { Link, useNavigate } from 'react-router-dom'
import { useMe, useStore } from '../store/useStore'
import { useEmployee, useVisibleCases } from '../lib/hooks'
import { ButtonLink, DueLabel, Empty, Label, PageHeader, Panel, PanelHeader, Person, RoleLabel, StageLabel, tdClass, thClass } from '../components/ui'
import { ago, cn, dueState, reasonLabel } from '../lib/utils'

export default function Dashboard() {
  const me = useMe()!
  const navigate = useNavigate()
  const { tasks, handoffs, cases } = useStore()
  const emp = useEmployee()
  const visible = useVisibleCases()
  const caseOf = (id: string) => cases.find((c) => c.id === id)!

  const incoming = handoffs.filter((h) => h.status === 'submitted' && h.toId === me.id)
  const outgoing = handoffs.filter((h) => h.status === 'submitted' && h.fromId === me.id)
  const myTasks = tasks
    .filter((t) => !t.done && t.ownerId === me.id)
    .sort((a, b) => (a.due ?? '9').localeCompare(b.due ?? '9'))
  const owned = visible.filter((c) => c.role === 'owner' && c.stage !== 'resolved')
  const overdueOnMine = tasks.filter((t) => dueState(t) === 'overdue' && (t.ownerId === me.id || caseOf(t.caseId)?.ownerId === me.id))
  const involved = visible.filter((c) => c.role !== 'admin' && c.role !== 'auditor')
  const list = me.orgRole === 'employee' ? involved : visible

  const counters: [string, number, string?][] = [
    ['Cases I own', owned.length],
    ['Forwarded to me', incoming.length, incoming.length ? 'text-red-700' : undefined],
    ['My open tasks', myTasks.length],
    ['Overdue (mine or my cases)', overdueOnMine.length, overdueOnMine.length ? 'text-red-700' : undefined],
  ]

  return (
    <>
      <PageHeader
        title="My work"
        sub={<>{me.name} · {me.title}, {me.department}</>}
        actions={me.orgRole !== 'auditor' && <ButtonLink to="/cases?new=1">Register complaint</ButtonLink>}
      />

      <div className="mb-5 grid grid-cols-2 divide-x divide-y divide-zinc-200 rounded-md border border-zinc-200 bg-white md:grid-cols-4 md:divide-y-0">
        {counters.map(([label, n, color]) => (
          <div key={label} className="px-4 py-3">
            <div className={cn('font-mono text-2xl font-semibold tabular-nums', color)}>{n}</div>
            <div className="text-xs text-zinc-500">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel>
          <PanelHeader title="Forwarded to me — waiting for my decision" sub="Acknowledge each section, ask questions, then accept or reject" />
          {incoming.length === 0 ? <Empty title="Nothing waiting" body="When a colleague forwards a case to you it appears here." /> : (
            <table className="w-full text-[13px]">
              <thead className="bg-zinc-50"><tr><th className={thClass}>Case</th><th className={thClass}>From</th><th className={thClass}>Reason</th><th className={thClass}>Ack.</th><th /></tr></thead>
              <tbody className="divide-y divide-zinc-100">
                {incoming.map((h) => {
                  const c = caseOf(h.caseId)
                  const acked = Object.values(h.acks).filter(Boolean).length
                  return (
                    <tr key={h.id} className="hover:bg-zinc-50">
                      <td className={tdClass}><div className="font-mono text-xs text-zinc-500">{c.code}</div><div className="max-w-56 truncate">{c.title}</div></td>
                      <td className={tdClass}><Person user={emp(h.fromId)} sub={ago(h.createdAt)} size="xs" /></td>
                      <td className={cn(tdClass, 'text-xs text-zinc-600')}>{reasonLabel[h.reason]}</td>
                      <td className={cn(tdClass, 'font-mono text-xs')}>{acked}/5</td>
                      <td className={cn(tdClass, 'text-right')}><ButtonLink to={`/handoffs/${h.id}`} size="sm">Review</ButtonLink></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          {outgoing.length > 0 && (
            <div className="border-t border-zinc-200 bg-zinc-50 px-4 py-2 text-xs text-zinc-600">
              {outgoing.map((h) => (
                <div key={h.id}>You forwarded <Link className="font-mono text-blue-700 hover:underline" to={`/handoffs/${h.id}`}>{caseOf(h.caseId).code}</Link> to {emp(h.toId)?.name} — awaiting their decision.</div>
              ))}
            </div>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="My open tasks" sub="Tasks assigned to me on any case, earliest deadline first" />
          {myTasks.length === 0 ? <Empty title="No open tasks" /> : (
            <table className="w-full text-[13px]">
              <thead className="bg-zinc-50"><tr><th className={thClass}>Task</th><th className={thClass}>Case</th><th className={thClass}>Due</th></tr></thead>
              <tbody className="divide-y divide-zinc-100">
                {myTasks.map((t) => (
                  <tr key={t.id} onClick={() => navigate(`/cases/${t.caseId}?tab=actions&highlight=${t.id}`)} className={cn('cursor-pointer hover:bg-zinc-50', dueState(t) === 'overdue' && 'bg-red-50/50')}>
                    <td className={tdClass}>{t.title}</td>
                    <td className={cn(tdClass, 'font-mono text-xs text-zinc-500')}>{caseOf(t.caseId)?.code}</td>
                    <td className={tdClass}><DueLabel task={t} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      <Panel className="mt-5">
        <PanelHeader
          title={me.orgRole === 'employee' ? 'Cases I am involved in' : 'All cases'}
          sub="Your role is worked out from each case's records — owner, incoming receiver, task assignee or previous owner"
          action={<Link to="/cases" className="text-xs text-blue-700 hover:underline">Open case register</Link>}
        />
        {list.length === 0 ? <Empty title="No cases yet" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-zinc-50"><tr><th className={thClass}>Case</th><th className={thClass}>My role</th><th className={thClass}>Stage</th><th className={thClass}>Owner</th><th className={thClass}>Updated</th></tr></thead>
              <tbody className="divide-y divide-zinc-100">
                {list.map((c) => (
                  <tr key={c.id} onClick={() => navigate(`/cases/${c.id}`)} className="cursor-pointer hover:bg-zinc-50">
                    <td className={tdClass}><span className="mr-2 font-mono text-xs text-zinc-500">{c.code}</span>{c.title}</td>
                    <td className={tdClass}><RoleLabel role={c.role} /></td>
                    <td className={tdClass}><StageLabel stage={c.stage} /></td>
                    <td className={tdClass}><Person user={emp(c.ownerId)} size="xs" /></td>
                    <td className={cn(tdClass, 'text-xs text-zinc-500')}>{ago(c.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {overdueOnMine.length > 0 && (
        <Panel className="mt-5 border-red-200">
          <PanelHeader title={<span className="text-red-800">Overdue actions</span>} sub="The deadline watcher has notified the assignee and the case owner" />
          <ul className="divide-y divide-zinc-100">
            {overdueOnMine.map((t) => (
              <li key={t.id}>
                <Link to={`/cases/${t.caseId}?tab=actions&highlight=${t.id}`} className="flex items-center gap-3 px-4 py-2 hover:bg-zinc-50">
                  <Label tone="red">OVERDUE</Label>
                  <span className="flex-1">{t.title}</span>
                  <span className="font-mono text-xs text-zinc-500">{caseOf(t.caseId).code}</span>
                  <Person user={emp(t.ownerId)} size="xs" />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  )
}
