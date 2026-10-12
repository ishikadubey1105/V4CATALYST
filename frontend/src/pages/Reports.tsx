import { useCallback, useEffect, useState } from 'react'
import { FileDown, FileText, Printer } from 'lucide-react'
import { api, useAction } from '../api'
import type { Report, ReportKpis, ReportQuery } from '../api/contracts'
import { BarList, GroupedColumns, Legend, SERIES, type Series } from '../components/charts'
import { Button, Empty, PageHeader, Panel, PanelHeader, inputClass, tdClass, thClass } from '../components/ui'
import { cn, fmtDateTime } from '../lib/utils'
import { CountUp, TiltCard } from '../components/motion'
import { stages } from '../lib/permissions'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const trendSeries: Series<'received' | 'resolved'>[] = [
  { key: 'received', label: 'Received', color: SERIES.blue },
  { key: 'resolved', label: 'Resolved', color: SERIES.orange },
]
const stageLabel = (k: string) => stages.find((s) => s.key === k)?.label ?? k
const cap = (k: string) => k.charAt(0).toUpperCase() + k.slice(1)

type KpiDef = { key: keyof ReportKpis; label: string; unit?: string; hint?: string }
const KPIS: KpiDef[] = [
  { key: 'received', label: 'Complaints received' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'avgResolutionDays', label: 'Avg. time to resolve', unit: 'days' },
  { key: 'openAtEnd', label: 'Open at period end' },
  { key: 'handoffsSubmitted', label: 'Cases forwarded' },
  { key: 'acceptanceRate', label: 'Forwards accepted', unit: '%' },
  { key: 'overdueEvents', label: 'Deadlines missed' },
  { key: 'escalations', label: 'Escalated to admins' },
]

function StatTile({ def, report }: { def: KpiDef; report: Report }) {
  const v = report.kpis[def.key]
  const p = report.previous[def.key]
  const delta = typeof v === 'number' && typeof p === 'number' ? Math.round((v - p) * 10) / 10 : null
  return (
    <TiltCard className="rounded-xl border border-zinc-200/80 bg-white p-4 shadow-sm">
      <div className="text-xs text-zinc-600">{def.label}</div>
      <div className="mt-1.5 font-display text-[30px] font-medium leading-none text-zinc-900">
        {v === null ? '—' : <CountUp value={v} decimals={Number.isInteger(v) ? 0 : 1} />}{v !== null && def.unit && <span className="ml-1 text-sm font-normal text-zinc-500">{def.unit}</span>}
      </div>
      <div className="mt-2 text-[11px] text-zinc-500">
        {delta === null ? `no data for ${report.period.previousLabel}` : delta === 0 ? `same as ${report.period.previousLabel}` : `${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)} vs ${report.period.previousLabel}`}
      </div>
    </TiltCard>
  )
}

function toCsv(r: Report): string {
  const esc = (v: unknown) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  const rows: unknown[][] = [
    ['Baton complaint report', r.period.label], ['Generated', r.generatedAt], [],
    ['Metric', r.period.label, r.period.previousLabel],
    ...(Object.keys(r.kpis) as (keyof ReportKpis)[]).map((k) => [k, r.kpis[k], r.previous[k]]), [],
    [r.period.kind === 'year' ? 'Month' : 'Day', 'Received', 'Resolved', 'Forwarded'],
    ...r.trend.map((b) => [b.label, b.received, b.resolved, b.handoffs]), [],
    ['Category', 'Complaints'], ...r.byCategory.map((b) => [b.key, b.count]), [],
    ['Priority', 'Complaints'], ...r.byPriority.map((b) => [b.key, b.count]), [],
    ['Channel', 'Complaints'], ...r.byChannel.map((b) => [b.key, b.count]), [],
    ['Employee', 'Department', 'Open cases now', 'Resolved', 'Forwards sent', 'Forwards accepted', 'Tasks completed', 'Overdue now'],
    ...r.people.map((p) => [p.name, p.department, p.openCases, p.resolved, p.handoffsSent, p.handoffsAccepted, p.tasksCompleted, p.overdueNow]),
  ]
  return rows.map((row) => row.map(esc).join(',')).join('\r\n')
}

function download(r: Report) {
  const blob = new Blob([toCsv(r)], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `baton-report-${r.period.kind === 'year' ? r.period.year : `${r.period.year}-${String(r.period.month).padStart(2, '0')}`}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

export default function Reports() {
  const now = new Date()
  const [q, setQ] = useState<ReportQuery>({ period: 'month', year: now.getFullYear(), month: now.getMonth() + 1 })
  const [report, setReport] = useState<Report | null>(null)
  const [showTable, setShowTable] = useState(false)
  const { run, pending } = useAction()
  const pdf = useAction()

  const load = useCallback(async () => {
    const res = await run(() => api.report(q.period === 'year' ? { period: 'year', year: q.year } : q))
    if (res) setReport(res)
  }, [q]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load() }, [load])

  const years = Array.from({ length: 4 }, (_, i) => now.getFullYear() - i)
  const r = report

  return (
    <>
      <PageHeader
        title="Reports"
        sub={r ? <>{r.period.kind === 'year' ? 'Yearly' : 'Monthly'} report · {r.period.label} · generated {fmtDateTime(r.generatedAt)}</> : 'Monthly and yearly complaint handling'}
        actions={r && (
          <div className="flex gap-2 print:hidden">
            <Button disabled={pdf.pending} onClick={() => pdf.run(
              () => api.reportPdf(q.period === 'year' ? { period: 'year', year: q.year } : q),
              { tone: 'success', title: 'Report downloaded', body: `${r.period.label} · two-page PDF` },
            )}>
              <FileText className="size-3.5" />{pdf.pending ? 'Preparing PDF…' : 'Download PDF report'}
            </Button>
            <Button variant="secondary" onClick={() => download(r)}><FileDown className="size-3.5" />Export CSV</Button>
            <Button variant="secondary" onClick={() => window.print()}><Printer className="size-3.5" />Print / PDF</Button>
          </div>
        )}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <div className="flex overflow-hidden rounded-lg border border-zinc-300/80 bg-white p-0.5 shadow-xs">
          {(['month', 'year'] as const).map((k) => (
            <button key={k} onClick={() => setQ({ ...q, period: k })}
              className={cn('rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors', q.period === k ? 'bg-zinc-900 text-white shadow-sm' : 'text-zinc-600 hover:text-zinc-900')}>
              {k === 'month' ? 'Monthly' : 'Yearly'}
            </button>
          ))}
        </div>
        {q.period === 'month' && (
          <select className={cn(inputClass, 'w-36')} value={q.month} onChange={(e) => setQ({ ...q, month: Number(e.target.value) })} aria-label="Month">
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        )}
        <select className={cn(inputClass, 'w-24')} value={q.year} onChange={(e) => setQ({ ...q, year: Number(e.target.value) })} aria-label="Year">
          {years.map((y) => <option key={y}>{y}</option>)}
        </select>
        {pending && <span className="text-xs text-zinc-500">Loading…</span>}
      </div>

      {!r ? <Panel><Empty title={pending ? 'Building report…' : 'No report loaded'} /></Panel> : (
        <div className="space-y-4">
          <Panel className="p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-700">Summary</div>
            <p className="mt-2 font-display text-[19px] leading-relaxed text-zinc-800">{r.summary}</p>
          </Panel>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {KPIS.map((d) => <StatTile key={d.key} def={d} report={r} />)}
          </div>

          <Panel>
            <PanelHeader
              title={`Received vs resolved by ${r.period.kind === 'year' ? 'month' : 'day'}`}
              sub="Hover a column for exact numbers"
              action={<button className="text-xs text-blue-700 hover:underline print:hidden" onClick={() => setShowTable((s) => !s)}>{showTable ? 'Show chart' : 'Show as table'}</button>}
            />
            <div className="p-4">
              {showTable ? (
                <div className="max-h-72 overflow-auto">
                  <table className="w-full text-[13px]">
                    <thead className="bg-zinc-50"><tr><th className={thClass}>{r.period.kind === 'year' ? 'Month' : 'Day'}</th><th className={thClass}>Received</th><th className={thClass}>Resolved</th><th className={thClass}>Forwarded</th></tr></thead>
                    <tbody className="divide-y divide-zinc-100">{r.trend.map((b) => <tr key={b.label}><td className={tdClass}>{b.label}</td><td className={cn(tdClass, 'font-mono')}>{b.received}</td><td className={cn(tdClass, 'font-mono')}>{b.resolved}</td><td className={cn(tdClass, 'font-mono')}>{b.handoffs}</td></tr>)}</tbody>
                  </table>
                </div>
              ) : (
                <>
                  <div className="mb-2"><Legend series={trendSeries} /></div>
                  <GroupedColumns rows={r.trend} series={trendSeries} labelEvery={5} ariaLabel={`Complaints received and resolved per ${r.period.kind === 'year' ? 'month' : 'day'}, ${r.period.label}`} />
                </>
              )}
            </div>
          </Panel>

          <div className="grid gap-4 md:grid-cols-3">
            <Panel><PanelHeader title="By category" /><div className="p-4"><BarList items={r.byCategory} /></div></Panel>
            <Panel><PanelHeader title="By priority" /><div className="p-4"><BarList items={r.byPriority} format={cap} /></div></Panel>
            <Panel><PanelHeader title="By channel" /><div className="p-4"><BarList items={r.byChannel} /></div></Panel>
          </div>

          <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
            <Panel>
              <PanelHeader title="Where this period's complaints are now" />
              <div className="p-4"><BarList items={r.byStage} format={stageLabel} /></div>
            </Panel>
            <Panel>
              <PanelHeader title="Handoffs" sub={`${r.kpis.handoffsAccepted} accepted · ${r.kpis.handoffsRejected} rejected · ${r.kpis.forcedReassignments} admin reassignments`} />
              <div className="grid grid-cols-3 gap-3 p-4 text-[13px]">
                <div><div className="text-xs text-zinc-600">Avg. time to accept</div><div className="mt-0.5 font-display text-[26px] font-medium leading-none text-zinc-900">{r.kpis.avgAcceptHours ?? '—'}{r.kpis.avgAcceptHours !== null && <span className="text-sm text-zinc-500"> h</span>}</div></div>
                <div><div className="text-xs text-zinc-600">Tasks completed</div><div className="mt-0.5 font-display text-[26px] font-medium leading-none text-zinc-900">{r.kpis.tasksCompleted}</div></div>
                <div><div className="text-xs text-zinc-600">Acceptance rate</div><div className="mt-0.5 font-display text-[26px] font-medium leading-none text-zinc-900">{r.kpis.acceptanceRate ?? '—'}{r.kpis.acceptanceRate !== null && <span className="text-sm text-zinc-500">%</span>}</div></div>
              </div>
            </Panel>
          </div>

          <Panel>
            <PanelHeader title="By employee" sub="Activity in this period; open cases and overdue tasks are as of now" />
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="bg-zinc-50"><tr>
                  {['Employee', 'Open cases', 'Resolved', 'Forwards sent', 'Forwards accepted', 'Tasks completed', 'Overdue now'].map((h) => <th key={h} className={thClass}>{h}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-zinc-100">
                  {r.people.map((p) => (
                    <tr key={p.employeeId}>
                      <td className={tdClass}><div className="font-medium">{p.name}</div><div className="text-xs text-zinc-500">{p.department}</div></td>
                      {[p.openCases, p.resolved, p.handoffsSent, p.handoffsAccepted, p.tasksCompleted].map((v, i) => <td key={i} className={cn(tdClass, 'font-mono')}>{v}</td>)}
                      <td className={cn(tdClass, 'font-mono', p.overdueNow > 0 && 'font-semibold text-red-700')}>{p.overdueNow}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {r.people.length === 0 && <Empty title="No activity in this period" />}
          </Panel>
        </div>
      )}
    </>
  )
}
