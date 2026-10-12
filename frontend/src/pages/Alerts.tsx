import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Clock, Info, OctagonAlert, RefreshCw, TriangleAlert } from 'lucide-react'
import type { Alert, AlertKind, AlertSeverity } from '../api/contracts'
import { Button, Empty, Label, PageHeader, Panel, Person, Tabs } from '../components/ui'
import { useEmployee } from '../lib/hooks'
import { ago, cn, fmtDateTime } from '../lib/utils'
import { useAlerts } from '../store/useAlerts'
import { useMe } from '../store/useStore'

export const severityMeta: Record<AlertSeverity, { label: string; tone: 'red' | 'amber' | 'blue' | 'neutral'; icon: typeof Info; row: string }> = {
  critical: { label: 'Critical', tone: 'red', icon: OctagonAlert, row: 'border-l-red-600' },
  high: { label: 'High', tone: 'red', icon: TriangleAlert, row: 'border-l-red-300' },
  warning: { label: 'Warning', tone: 'amber', icon: Clock, row: 'border-l-amber-400' },
  info: { label: 'Info', tone: 'neutral', icon: Info, row: 'border-l-zinc-300' },
}

const kindLabel: Record<AlertKind, string> = {
  task_overdue: 'Overdue task',
  task_due_soon: 'Due soon',
  handoff_waiting: 'Forward waiting',
  question_unanswered: 'Unanswered question',
  case_stale: 'No activity',
}

function when(a: Alert) {
  if (a.kind === 'task_overdue' || a.kind === 'task_due_soon') return `due ${fmtDateTime(a.at)}`
  return `since ${ago(a.at)}`
}

export default function Alerts() {
  const me = useMe()!
  const emp = useEmployee()
  const { alerts, counts, loaded, refresh } = useAlerts()
  const [filter, setFilter] = useState<'all' | AlertSeverity>('all')
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => { void refresh() }, [refresh])

  const shown = alerts.filter((a) => filter === 'all' || a.severity === filter)
  const scope = me.orgRole === 'employee'
    ? 'Your tasks, cases you own, forwards to or from you, and questions waiting on you'
    : 'Everything late or about to be, across all cases'

  return (
    <>
      <PageHeader
        title="Alerts"
        sub={scope}
        actions={
          <Button variant="secondary" disabled={refreshing} onClick={async () => { setRefreshing(true); await refresh(); setRefreshing(false) }}>
            <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />Refresh
          </Button>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-zinc-200 bg-zinc-200 md:grid-cols-4">
        {(Object.keys(severityMeta) as AlertSeverity[]).map((s) => {
          const { label, icon: Icon, tone } = severityMeta[s]
          return (
            <button key={s} onClick={() => setFilter(filter === s ? 'all' : s)} aria-pressed={filter === s}
              className={cn('block w-full px-5 py-4 text-left transition-colors', filter === s ? 'bg-zinc-50 shadow-[inset_0_-2px_0_var(--color-zinc-900)]' : 'bg-white hover:bg-zinc-50')}>
              <div className="flex items-center gap-1.5 text-[12px] text-zinc-500"><Icon className={cn('size-3.5', tone === 'red' ? 'text-red-700' : tone === 'amber' ? 'text-amber-700' : 'text-zinc-400')} />{label}</div>
              <div className={cn('mt-1 font-display text-[30px] leading-none tabular-nums', counts[s] && s === 'critical' ? 'text-red-700' : 'text-zinc-900')}>{counts[s]}</div>
            </button>
          )
        })}
      </div>

      <Panel>
        <div className="px-3 pt-2">
          <Tabs value={filter} onChange={setFilter} items={[
            { key: 'all', label: 'All', count: alerts.length },
            { key: 'critical', label: 'Critical', count: counts.critical },
            { key: 'high', label: 'High', count: counts.high },
            { key: 'warning', label: 'Warning', count: counts.warning },
            { key: 'info', label: 'Info', count: counts.info },
          ]} />
        </div>
        <ul className="divide-y divide-zinc-100">
          {shown.map((a) => {
            const meta = severityMeta[a.severity]
            const Icon = meta.icon
            return (
              <li key={a.id} className={cn('border-l-4', meta.row)}>
                <Link to={a.link} className="flex items-start gap-3 px-4 py-2.5 hover:bg-zinc-50">
                  <Icon className={cn('mt-0.5 size-4 shrink-0', meta.tone === 'red' ? 'text-red-700' : meta.tone === 'amber' ? 'text-amber-700' : 'text-zinc-400')} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Label tone={meta.tone}>{meta.label}</Label>
                      <span className="text-[11px] uppercase tracking-wide text-zinc-500">{kindLabel[a.kind]}</span>
                      <span className="font-mono text-[11px] text-zinc-500">{a.caseCode}</span>
                    </div>
                    <div className="mt-0.5 text-[13px] font-medium text-zinc-900">{a.title}</div>
                    <div className="text-xs text-zinc-600">{a.detail} · {when(a)}</div>
                  </div>
                  {a.responsibleId && <div className="hidden shrink-0 sm:block"><Person user={emp(a.responsibleId)} sub="Responsible" size="xs" /></div>}
                </Link>
              </li>
            )
          })}
        </ul>
        {loaded && shown.length === 0 && <Empty title={filter === 'all' ? 'Nothing is late — no alerts' : `No ${severityMeta[filter as AlertSeverity].label.toLowerCase()} alerts`} />}
        {!loaded && <Empty title="Loading alerts…" />}
      </Panel>

      <p className="mt-3 text-xs text-zinc-500">
        Reminders go out automatically: assignees 24h before a deadline, assignee and owner when it is missed, every admin when a task is
        48h overdue (critical), and the receiver when a forward has waited 24h.
      </p>
    </>
  )
}
