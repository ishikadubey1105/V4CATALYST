import { useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AlarmClock, ArrowRight, FolderOpen, Inbox, ListChecks, Plus, Siren } from 'lucide-react'
import { useMe, useStore } from '../store/useStore'
import { useEmployee, useVisibleCases } from '../lib/hooks'
import { ButtonLink, DueLabel, Empty, Label, Panel, PanelHeader, Person, RoleLabel, StageLabel, tdClass, thClass } from '../components/ui'
import { useAlerts } from '../store/useAlerts'
import { ago, cn, dueState, reasonLabel } from '../lib/utils'
import { CountUp, TiltCard } from '../components/motion'

/** One hue per kind of work, used on its stat card and on the matching panel heading. */
const accents = {
  olive: { card: 'from-blue-50 via-white to-white border-blue-200/70', chip: 'bg-blue-700 text-white', bar: 'bg-blue-600', num: 'text-blue-900' },
  caramel: { card: 'from-[#f8eddd] via-white to-white border-[#ecd8bd]', chip: 'bg-[#c08040] text-white', bar: 'bg-[#c08040]', num: 'text-[#6b4320]' },
  moss: { card: 'from-emerald-50 via-white to-white border-emerald-200/70', chip: 'bg-emerald-600 text-white', bar: 'bg-emerald-500', num: 'text-emerald-800' },
  red: { card: 'from-red-50 via-white to-white border-red-200', chip: 'bg-red-600 text-white', bar: 'bg-red-500', num: 'text-red-700' },
  sand: { card: 'from-zinc-100 via-white to-white border-zinc-200', chip: 'bg-zinc-700 text-white', bar: 'bg-zinc-400', num: 'text-zinc-900' },
} as const
type Accent = keyof typeof accents

function Chip({ icon: Icon, accent }: { icon: typeof Inbox; accent: Accent }) {
  return <span className={cn('grid size-7 shrink-0 place-items-center rounded-lg shadow-sm', accents[accent].chip)}><Icon className="size-3.5" strokeWidth={2} /></span>
}
const titled = (icon: typeof Inbox, accent: Accent, text: string) => (
  <span className="flex items-center gap-2.5"><Chip icon={icon} accent={accent} />{text}</span>
)

export default function Dashboard() {
  const me = useMe()!
  const navigate = useNavigate()
  const { hash } = useLocation()
  // stat cards link to sections on this page (#incoming, #tasks): scroll to them
  useEffect(() => { if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, [hash])
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

  const alertCounts = useAlerts((st) => st.counts)
  const urgentAlerts = alertCounts.critical + alertCounts.high
  const counters: { label: string; n: number; icon: typeof Inbox; hint: string; accent: Accent; to: string }[] = [
    { label: 'Cases I own', n: owned.length, icon: FolderOpen, hint: 'Open, not yet resolved', accent: 'olive', to: '/cases' },
    { label: 'Forwarded to me', n: incoming.length, icon: Inbox, hint: 'Waiting for your decision', accent: 'caramel', to: '/dashboard#incoming' },
    { label: 'My open tasks', n: myTasks.length, icon: ListChecks, hint: 'Across all cases', accent: 'moss', to: '/dashboard#tasks' },
    { label: 'Overdue', n: overdueOnMine.length, icon: AlarmClock, hint: overdueOnMine.length ? 'Needs attention today' : 'Mine or on my cases', accent: overdueOnMine.length ? 'red' : 'sand', to: '/alerts' },
  ]
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const summary = incoming.length || overdueOnMine.length
    ? [incoming.length && `${incoming.length} handover${incoming.length > 1 ? 's' : ''} waiting for you`, overdueOnMine.length && `${overdueOnMine.length} overdue task${overdueOnMine.length > 1 ? 's' : ''}`].filter(Boolean).join(' · ')
    : 'Nothing urgent — a calm day so far.'

  return (
    <>
      <section className="grain relative mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-blue-900 via-blue-900 to-blue-800 px-7 py-8 text-zinc-50 shadow-md sm:px-10">
        {/* quiet line drawing of the relay: two stations, the arc, the baton */}
        <svg aria-hidden="true" viewBox="0 0 420 180" className="pointer-events-none absolute bottom-2 right-6 hidden h-[180px] w-[420px] opacity-90 lg:block">
          <path d="M40 150 C 140 20, 280 20, 380 150" fill="none" stroke="#b6c17f" strokeOpacity=".55" strokeWidth="1.5" strokeDasharray="0.5 7" strokeLinecap="round" />
          <ellipse cx="40" cy="156" rx="26" ry="7" fill="none" stroke="#c08040" strokeWidth="1.5" />
          <ellipse cx="380" cy="156" rx="26" ry="7" fill="none" stroke="#b6c17f" strokeOpacity=".8" strokeWidth="1.5" />
          <rect x="196" y="44" width="46" height="13" rx="6.5" transform="rotate(14 219 50)" fill="#c08040" />
          <rect x="206" y="44" width="5" height="13" transform="rotate(14 219 50)" fill="#7a4b22" opacity=".6" />
          <rect x="228" y="44" width="5" height="13" transform="rotate(14 219 50)" fill="#7a4b22" opacity=".6" />
        </svg>
        <div className="relative max-w-2xl">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-baton-soft/90">{today}</div>
          <h1 className="mt-2 font-display text-[34px] font-normal leading-tight sm:text-[40px]">{greeting}, {me.name.split(' ')[0]}</h1>
          <p className="mt-2 text-[14px] text-blue-100/80">{summary}</p>
          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            {me.orgRole !== 'auditor' && (
              <Link to="/cases?new=1" className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-[13px] font-medium text-blue-900 shadow-sm transition hover:bg-blue-50 active:translate-y-px">
                <Plus className="size-4" />Register complaint
              </Link>
            )}
            <Link to="/alerts" className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/20 px-4 text-[13px] font-medium text-zinc-50 transition hover:bg-white/10">
              <Siren className="size-4" />{urgentAlerts ? `${urgentAlerts} alert${urgentAlerts > 1 ? 's' : ''} need attention` : 'View alerts'}<ArrowRight className="size-3.5 opacity-70" />
            </Link>
            <span className="ml-1 text-[12px] text-blue-100/60">{me.title} · {me.department}</span>
          </div>
        </div>
      </section>

      <div className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {counters.map(({ label, n, icon: Icon, hint, accent, to }) => {
          const a = accents[accent]
          return (
            <TiltCard key={label} className={cn('rounded-2xl border bg-gradient-to-br shadow-sm', a.card)}>
              <Link to={to} className="block rounded-2xl p-5">
                <div className="flex items-start justify-between">
                  <span className={cn('grid size-10 place-items-center rounded-xl shadow-sm', a.chip)}><Icon className="size-[18px]" strokeWidth={1.9} /></span>
                  <ArrowRight className="size-4 text-zinc-300" />
                </div>
                <div className={cn('mt-4 font-display text-[38px] font-medium leading-none', a.num)}><CountUp value={n} /></div>
                <div className="mt-2 text-[13px] font-medium text-zinc-800">{label}</div>
                <div className="mt-0.5 text-[11.5px] text-zinc-500">{hint}</div>
                <div className={cn('mt-4 h-1 w-10 rounded-full', a.bar)} />
              </Link>
            </TiltCard>
          )
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel id="incoming">
          <PanelHeader title={titled(Inbox, 'caramel', 'Forwarded to me — waiting for my decision')} sub="Acknowledge each section, ask questions, then accept or reject" />
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
            <div className="border-t border-zinc-100 bg-zinc-50/70 px-5 py-2.5 text-xs text-zinc-600">
              {outgoing.map((h) => (
                <div key={h.id}>You forwarded <Link className="font-mono text-blue-700 hover:underline" to={`/handoffs/${h.id}`}>{caseOf(h.caseId).code}</Link> to {emp(h.toId)?.name} — awaiting their decision.</div>
              ))}
            </div>
          )}
        </Panel>

        <Panel id="tasks">
          <PanelHeader title={titled(ListChecks, 'moss', 'My open tasks')} sub="Tasks assigned to me on any case, earliest deadline first" />
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

      <Panel className="mt-6">
        <PanelHeader
          title={titled(FolderOpen, 'olive', me.orgRole === 'employee' ? 'Cases I am involved in' : 'All cases')}
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
        <Panel className="mt-6 border-red-200/80">
          <PanelHeader title={titled(AlarmClock, 'red', 'Overdue actions')} sub="The deadline watcher has notified the assignee and the case owner" />
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
