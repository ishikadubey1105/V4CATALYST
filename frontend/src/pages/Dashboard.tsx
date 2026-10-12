import { Fragment, useEffect, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Plus } from 'lucide-react'
import { useMe, useStore } from '../store/useStore'
import { useEmployee, useVisibleCases } from '../lib/hooks'
import { ButtonLink, DueLabel, Empty, Panel, PanelHeader, Person, RoleLabel, StageLabel, tdClass, thClass } from '../components/ui'
import { useAlerts } from '../store/useAlerts'
import type { AlertSeverity } from '../api/contracts'
import { ago, cn, dueState, reasonLabel } from '../lib/utils'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

const severityDot: Record<AlertSeverity, string> = {
  critical: 'bg-red-600', high: 'bg-red-400', warning: 'bg-amber-500', info: 'bg-zinc-300',
}

/** One number in the stats strip. Quiet by default; red only when it means something is wrong. */
function Stat({ label, value, note, to, alarm }: { label: string; value: number; note: ReactNode; to: string; alarm?: boolean }) {
  return (
    <Link to={to} className="group block bg-white px-5 py-4 transition-colors hover:bg-zinc-50">
      <div className="flex items-center justify-between text-[12px] text-zinc-500">
        {label}
        <ArrowRight className="size-3.5 -translate-x-1 text-zinc-400 opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100" />
      </div>
      <div className={cn('mt-1 font-display text-[30px] leading-none tabular-nums', alarm ? 'text-red-700' : 'text-zinc-900')}>{value}</div>
      <div className="mt-1.5 text-[12px] text-zinc-500">{note}</div>
    </Link>
  )
}

export default function Dashboard() {
  const me = useMe()!
  const navigate = useNavigate()
  const { hash } = useLocation()
  useEffect(() => { if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, [hash])
  const { tasks, handoffs, cases } = useStore()
  const emp = useEmployee()
  const visible = useVisibleCases()
  const alerts = useAlerts((s) => s.alerts)
  const caseOf = (id: string) => cases.find((c) => c.id === id)!

  const staff = me.orgRole === 'employee'
  const incoming = handoffs.filter((h) => h.status === 'submitted' && h.toId === me.id)
  const outgoing = handoffs.filter((h) => h.status === 'submitted' && h.fromId === me.id)
  const inFlight = staff ? [...incoming, ...outgoing] : handoffs.filter((h) => h.status === 'submitted')
  const myTasks = tasks.filter((t) => !t.done && t.ownerId === me.id).sort((a, b) => (a.due ?? '9').localeCompare(b.due ?? '9'))
  const owned = visible.filter((c) => c.role === 'owner' && c.stage !== 'resolved')
  const overdueMine = tasks.filter((t) => dueState(t) === 'overdue' && (t.ownerId === me.id || caseOf(t.caseId)?.ownerId === me.id))
  const overdueAll = tasks.filter((t) => dueState(t) === 'overdue')
  const open = cases.filter((c) => c.stage !== 'resolved')
  const monthAgo = Date.now() - 30 * 86_400_000
  const resolvedRecently = cases.filter((c) => c.stage === 'resolved' && Date.parse(c.updatedAt) > monthAgo)
  const weekAhead = Date.now() + 7 * 86_400_000
  const dueThisWeek = myTasks.filter((t) => t.due && Date.parse(t.due) < weekAhead && dueState(t) !== 'overdue')
  const list = staff ? visible.filter((c) => c.role !== 'admin' && c.role !== 'auditor') : visible
  const attention = alerts.filter((a) => a.severity !== 'info').slice(0, 6)

  // One factual sentence, written from the data — never "calm" when something is on fire.
  const critical = alerts.filter((a) => a.severity === 'critical')
  const parts: ReactNode[] = []
  if (critical.length) parts.push(<>{plural(critical.length, 'critical alert')} on <Link className="font-mono text-red-700 underline-offset-2 hover:underline" to={critical[0].link}>{critical[0].caseCode}</Link></>)
  if (incoming.length) parts.push(<>{plural(incoming.length, 'forward')} waiting for your review</>)
  if (staff && overdueMine.length) parts.push(<>{plural(overdueMine.length, 'overdue task')}</>)
  if (!staff && inFlight.length) parts.push(<>{plural(inFlight.length, 'case')} mid-handoff</>)
  const hour = new Date().getHours()
  const greeting = hour < 5 ? 'Working late' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

  const stats = staff
    ? [
        { label: 'Cases you own', value: owned.length, note: 'open, not yet resolved', to: '/cases' },
        { label: 'Waiting on you', value: incoming.length, note: incoming.length ? 'forwards to review' : 'no forwards to review', to: '/dashboard#handoffs' },
        { label: 'Your open tasks', value: myTasks.length, note: dueThisWeek.length ? `${dueThisWeek.length} due this week` : 'nothing due this week', to: '/dashboard#tasks' },
        { label: 'Overdue', value: overdueMine.length, note: 'yours or on your cases', to: '/alerts', alarm: overdueMine.length > 0 },
      ]
    : [
        { label: 'Open cases', value: open.length, note: `${open.filter((c) => c.priority === 'high').length} high priority`, to: '/cases' },
        { label: 'In handoff', value: inFlight.length, note: 'awaiting the receiver', to: '/dashboard#handoffs' },
        { label: 'Overdue tasks', value: overdueAll.length, note: overdueAll.length ? `across ${plural(new Set(overdueAll.map((t) => t.caseId)).size, 'case')}` : 'everything on time', to: '/alerts', alarm: overdueAll.length > 0 },
        { label: 'Resolved', value: resolvedRecently.length, note: 'in the last 30 days', to: '/cases' },
      ]

  return (
    <>
      <header className="mb-7 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="text-[12.5px] text-zinc-500">{today} · {me.department}</div>
          <h1 className="mt-1 font-display text-[32px] font-normal leading-tight text-zinc-900">{greeting}, {me.name.split(' ')[0]}.</h1>
          <p className="mt-1.5 text-[14.5px] text-zinc-600">
            {parts.length
              ? parts.map((p, i) => <Fragment key={i}>{i === 0 ? '' : i === parts.length - 1 ? ' and ' : ', '}{p}</Fragment>)
              : 'Nothing needs you right now.'}
            {parts.length > 0 && '.'}
          </p>
        </div>
        {me.orgRole !== 'auditor' && <ButtonLink to="/cases?new=1"><Plus className="size-4" />Register complaint</ButtonLink>}
      </header>

      <section aria-label="Summary" className="mb-7 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-zinc-200 bg-zinc-200 lg:grid-cols-4">
        {stats.map((s) => <Stat key={s.label} {...s} />)}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Panel>
          <PanelHeader title="Needs attention" sub={staff ? 'Late or close to it, on your work' : 'Late or close to it, across all cases'}
            action={<Link to="/alerts" className="text-xs text-blue-700 hover:underline">All alerts</Link>} />
          {attention.length === 0 ? <Empty title="Nothing needs you right now" body="Overdue tasks, waiting forwards and unanswered questions show up here." /> : (
            <ul className="divide-y divide-zinc-100">
              {attention.map((a) => (
                <li key={a.id}>
                  <Link to={a.link} className="flex items-start gap-3 px-5 py-3 hover:bg-zinc-50">
                    <span className={cn('mt-[7px] size-2 shrink-0 rounded-full', severityDot[a.severity])} aria-label={a.severity} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] text-zinc-900">{a.title}</span>
                      <span className="block truncate text-[12px] text-zinc-500"><span className="font-mono">{a.caseCode}</span> · {a.detail.replace(`${a.caseCode} · `, '')}</span>
                    </span>
                    <span className="shrink-0 pt-0.5 text-[12px] text-zinc-400">{ago(a.at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel id="handoffs">
          <PanelHeader title="Handoffs in flight" sub={staff ? 'Forwards to and from you' : 'Every forward awaiting a decision'} />
          {inFlight.length === 0 ? <Empty title="No handoffs in flight" body="When a case is forwarded it shows here until it is accepted or sent back." /> : (
            <ul className="divide-y divide-zinc-100">
              {inFlight.map((h) => {
                const c = caseOf(h.caseId)
                const acked = Object.values(h.acks).filter(Boolean).length
                const toMe = h.toId === me.id
                return (
                  <li key={h.id}>
                    <Link to={`/handoffs/${h.id}`} className="block px-5 py-3 hover:bg-zinc-50">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-[13.5px] text-zinc-900"><span className="mr-1.5 font-mono text-[12px] text-zinc-500">{c.code}</span>{c.title}</span>
                        {toMe ? <span className="shrink-0 text-[12px] font-medium text-blue-700">Review</span> : <span className="shrink-0 font-mono text-[12px] text-zinc-500">{acked}/5</span>}
                      </div>
                      <div className="mt-1 text-[12px] text-zinc-500">
                        {emp(h.fromId)?.name} → {emp(h.toId)?.name} · {reasonLabel[h.reason].toLowerCase()} · {ago(h.createdAt)}
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>
      </div>

      {staff && (
        <Panel id="tasks" className="mt-6">
          <PanelHeader title="Your open tasks" sub="Earliest deadline first" />
          {myTasks.length === 0 ? <Empty title="No open tasks" /> : (
            <table className="w-full text-[13px]">
              <thead className="bg-zinc-50"><tr><th className={thClass}>Task</th><th className={thClass}>Case</th><th className={thClass}>Due</th></tr></thead>
              <tbody className="divide-y divide-zinc-100">
                {myTasks.map((t) => (
                  <tr key={t.id} onClick={() => navigate(`/cases/${t.caseId}?tab=actions&highlight=${t.id}`)} className="cursor-pointer hover:bg-zinc-50">
                    <td className={tdClass}>{t.title}</td>
                    <td className={cn(tdClass, 'font-mono text-xs text-zinc-500')}>{caseOf(t.caseId)?.code}</td>
                    <td className={tdClass}><DueLabel task={t} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      )}

      <Panel className="mt-6">
        <PanelHeader
          title={staff ? 'Your cases' : 'All cases'}
          sub={staff ? 'Every case you own, receive, have tasks on, or owned before' : 'Most recently updated first'}
          action={<Link to="/cases" className="text-xs text-blue-700 hover:underline">Case register</Link>}
        />
        {list.length === 0 ? <Empty title="No cases yet" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-zinc-50"><tr><th className={thClass}>Case</th>{staff && <th className={thClass}>Your role</th>}<th className={thClass}>Stage</th><th className={thClass}>Owner</th><th className={thClass}>Updated</th></tr></thead>
              <tbody className="divide-y divide-zinc-100">
                {[...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((c) => (
                  <tr key={c.id} onClick={() => navigate(`/cases/${c.id}`)} className="cursor-pointer hover:bg-zinc-50">
                    <td className={tdClass}><span className="mr-2 font-mono text-xs text-zinc-500">{c.code}</span>{c.title}</td>
                    {staff && <td className={tdClass}><RoleLabel role={c.role} /></td>}
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
    </>
  )
}
