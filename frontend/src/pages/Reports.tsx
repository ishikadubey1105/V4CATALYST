import { useEffect, useState } from 'react'
import { FileDown, FileText, RefreshCw } from 'lucide-react'
import { api, useAction } from '../api'
import type { Report, ReportKpis, ReportQuery } from '../api/contracts'
import { Button, PageHeader, Panel, inputClass } from '../components/ui'
import { cn } from '../lib/utils'

/*
 * The report itself is produced by the backend's reporting service (Python: reportlab + matplotlib). This page picks
 * the period and shows that exact document, so what people read here is what they download and send on.
 */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function toCsv(r: Report): string {
  const esc = (v: unknown) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  const rows: unknown[][] = [
    ['Thread complaint report', r.period.label], ['Generated', r.generatedAt], [],
    ['Metric', r.period.label, r.period.previousLabel],
    ...(Object.keys(r.kpis) as (keyof ReportKpis)[]).map((k) => [k, r.kpis[k], r.previous[k]]), [],
    [r.period.kind === 'year' ? 'Month' : 'Day', 'Received', 'Resolved', 'Forwarded', 'Open at end'],
    ...r.trend.map((b) => [b.label, b.received, b.resolved, b.handoffs, b.open ?? '']), [],
    ['Category', 'Complaints'], ...r.byCategory.map((b) => [b.key, b.count]), [],
    ['Priority', 'Complaints'], ...r.byPriority.map((b) => [b.key, b.count]), [],
    ['Channel', 'Complaints'], ...r.byChannel.map((b) => [b.key, b.count]), [],
    ['Employee', 'Department', 'Open cases now', 'Resolved', 'Forwards sent', 'Forwards accepted', 'Tasks completed', 'Overdue now'],
    ...r.people.map((p) => [p.name, p.department, p.openCases, p.resolved, p.handoffsSent, p.handoffsAccepted, p.tasksCompleted, p.overdueNow]),
  ]
  return rows.map((row) => row.map(esc).join(',')).join('\r\n')
}

function saveCsv(r: Report) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([toCsv(r)], { type: 'text/csv;charset=utf-8' }))
  a.download = `thread-report-${r.period.kind === 'year' ? r.period.year : `${r.period.year}-${String(r.period.month).padStart(2, '0')}`}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

export default function Reports() {
  const now = new Date()
  const [q, setQ] = useState<ReportQuery>({ period: 'month', year: now.getFullYear(), month: now.getMonth() + 1 })
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const preview = useAction()
  const pdf = useAction()
  const csv = useAction()
  const query: ReportQuery = q.period === 'year' ? { period: 'year', year: q.year } : q

  // Generate the document for the chosen period and show it in the page.
  useEffect(() => {
    let url: string | null = null
    let cancelled = false
    void preview.run(async () => {
      const blob = await api.reportPdfBlob(query)
      if (cancelled) return
      url = URL.createObjectURL(blob)
      setPdfUrl(url)
    })
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url) }
  }, [q.period, q.year, q.month, version]) // eslint-disable-line react-hooks/exhaustive-deps

  const years = Array.from({ length: 4 }, (_, i) => now.getFullYear() - i)
  const label = q.period === 'year' ? String(q.year) : `${MONTHS[(q.month ?? 1) - 1]} ${q.year}`

  return (
    <>
      <PageHeader
        title="Reports"
        sub="Complaint handling reports, produced from the case records and the audit log."
        actions={
          <div className="flex gap-2 print:hidden">
            <Button disabled={pdf.pending} onClick={() => pdf.run(() => api.reportPdf(query), { tone: 'success', title: 'Report downloaded', body: label })}>
              <FileText className="size-4" />{pdf.pending ? 'Preparing…' : 'Download PDF'}
            </Button>
            <Button variant="secondary" disabled={csv.pending} onClick={() => csv.run(async () => saveCsv(await api.report(query)))}>
              <FileDown className="size-4" />Export data (CSV)
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-zinc-300/80 bg-white p-0.5 shadow-xs">
          {(['month', 'year'] as const).map((k) => (
            <button key={k} onClick={() => setQ({ ...q, period: k })}
              className={cn('rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors', q.period === k ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:text-zinc-900')}>
              {k === 'month' ? 'Monthly' : 'Annual'}
            </button>
          ))}
        </div>
        {q.period === 'month' && (
          <select className={cn(inputClass, 'w-40')} value={q.month} onChange={(e) => setQ({ ...q, month: Number(e.target.value) })} aria-label="Month">
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        )}
        <select className={cn(inputClass, 'w-28')} value={q.year} onChange={(e) => setQ({ ...q, year: Number(e.target.value) })} aria-label="Year">
          {years.map((y) => <option key={y}>{y}</option>)}
        </select>
        <button onClick={() => setVersion((v) => v + 1)} className="ml-1 inline-flex items-center gap-1.5 text-[12.5px] text-zinc-600 hover:text-zinc-900" title="Regenerate with the latest data">
          <RefreshCw className={cn('size-3.5', preview.pending && 'animate-spin')} />{preview.pending ? 'Generating…' : 'Regenerate'}
        </button>
      </div>

      <Panel className="bg-zinc-100/60">
        {pdfUrl ? (
          <iframe key={pdfUrl} title={`Complaint handling report, ${label}`} src={`${pdfUrl}#view=FitH&toolbar=1`} className="block h-[calc(100vh-250px)] min-h-[620px] w-full bg-white" />
        ) : (
          <div className="grid h-[60vh] place-items-center text-[13px] text-zinc-500">{preview.pending ? 'Generating the report…' : 'The report could not be generated.'}</div>
        )}
      </Panel>
      <p className="mt-2 text-[12px] text-zinc-500">
        This is the document that downloads. Figures for a period still in progress are compared like for like with the same point in the previous period.
      </p>
    </>
  )
}
