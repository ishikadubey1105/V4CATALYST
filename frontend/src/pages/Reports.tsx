import { useEffect, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { FileDown, FileText, RefreshCw } from 'lucide-react'
import { api, useAction } from '../api'
import type { Report, ReportDownloads, ReportPeriod, ReportQuery } from '../api/contracts'
import { Button, PageHeader, Panel, inputClass } from '../components/ui'
import { CountUp } from '../components/motion'
import { ago, cn } from '../lib/utils'

/*
 * Reports are computed and rendered by the backend (Python: reportlab + matplotlib) from the case records and the
 * audit log — no external service. This page picks the period, shows that exact document, and tracks downloads.
 */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const SHORT = MONTHS.map((m) => m.slice(0, 3))

/** ISO-8601 week (Monday start) of the local calendar date — the server uses the organisation's timezone too. */
function isoWeek(d: Date): { year: number; week: number; monday: Date } {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) // local date, computed on a UTC clock
  const dow = t.getUTCDay() || 7
  const monday = new Date(t.getTime() - (dow - 1) * 86_400_000)
  t.setUTCDate(t.getUTCDate() + 4 - dow) // Thursday decides the year
  const year = t.getUTCFullYear()
  const week = Math.ceil(((t.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7)
  return { year, week, monday }
}

/** The current week and the 25 before it, newest first. */
function recentWeeks() {
  const { monday } = isoWeek(new Date())
  return Array.from({ length: 26 }, (_, i) => {
    const start = new Date(monday.getTime() - i * 7 * 86_400_000)
    const end = new Date(start.getTime() + 6 * 86_400_000)
    const { year, week } = isoWeek(start)
    const span = start.getUTCMonth() === end.getUTCMonth()
      ? `${start.getUTCDate()}–${end.getUTCDate()} ${SHORT[end.getUTCMonth()]}`
      : `${start.getUTCDate()} ${SHORT[start.getUTCMonth()]} – ${end.getUTCDate()} ${SHORT[end.getUTCMonth()]}`
    return { year, week, key: `${year}-${week}`, label: `${i === 0 ? 'This week' : i === 1 ? 'Last week' : `Week ${week}`} · ${span}` }
  })
}

function initialQuery(kind: ReportPeriod): ReportQuery {
  const now = new Date()
  if (kind === 'week') { const w = isoWeek(now); return { period: 'week', year: w.year, week: w.week } }
  if (kind === 'month') return { period: 'month', year: now.getFullYear(), month: now.getMonth() + 1 }
  return { period: 'year', year: now.getFullYear() }
}

const periodTabs: { key: ReportPeriod; label: string }[] = [{ key: 'week', label: 'Weekly' }, { key: 'month', label: 'Monthly' }, { key: 'year', label: 'Annual' }]

/** One figure in the metric strip, with the change against the comparison period. */
function Metric({ label, value, prev, note, invert }: { label: string; value: number | null; prev?: number | null; note?: string; invert?: boolean }) {
  const d = value !== null && prev !== null && prev !== undefined ? value - prev : null
  const good = d !== null && d !== 0 && (invert ? d < 0 : d > 0)
  return (
    <div className="bg-white px-4 py-3.5">
      <div className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-zinc-500">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-[26px] font-semibold leading-none tracking-tight text-zinc-900">
          {value === null ? '–' : <CountUp value={value} decimals={Number.isInteger(value) ? 0 : 1} />}
        </span>
        {d !== null && d !== 0 && (
          <span className={cn('rounded px-1.5 py-0.5 font-mono text-[11px] font-medium', good ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-600')}>
            {d > 0 ? '+' : '–'}{Math.abs(Math.round(d * 10) / 10)}
          </span>
        )}
      </div>
      {note && <div className="mt-1 truncate text-[11.5px] text-zinc-500">{note}</div>}
    </div>
  )
}

export default function Reports() {
  const reduceMotion = useReducedMotion()
  const weeks = useMemo(recentWeeks, [])
  const [q, setQ] = useState<ReportQuery>(() => initialQuery('week'))
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [data, setData] = useState<Report | null>(null)
  const [downloads, setDownloads] = useState<ReportDownloads | null>(null)
  const [version, setVersion] = useState(0)
  const preview = useAction()
  const pdf = useAction()
  const csv = useAction()

  const query: ReportQuery = q.period === 'year' ? { period: 'year', year: q.year }
    : q.period === 'week' ? { period: 'week', year: q.year, week: q.week } : { period: 'month', year: q.year, month: q.month }
  const label = q.period === 'year' ? String(q.year)
    : q.period === 'week' ? (weeks.find((w) => w.year === q.year && w.week === q.week)?.label.split(' · ')[0] ?? `Week ${q.week}`)
      : `${MONTHS[(q.month ?? 1) - 1]} ${q.year}`

  const refreshDownloads = () => api.reportDownloads().then(setDownloads).catch(() => undefined)

  // Generate the document and its figures for the chosen period.
  useEffect(() => {
    let url: string | null = null
    let cancelled = false
    void preview.run(async () => {
      const [blob, report] = await Promise.all([api.reportPdfBlob(query), api.report(query)])
      if (cancelled) return
      url = URL.createObjectURL(blob)
      setPdfUrl(url)
      setData(report)
    })
    void refreshDownloads()
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url) }
  }, [q.period, q.year, q.month, q.week, version]) // eslint-disable-line react-hooks/exhaustive-deps

  const years = Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - i)
  const k = data?.kpis
  const p = data?.previous
  const download = (run: typeof pdf, fn: () => Promise<void>, what: string) =>
    run.run(async () => { await fn(); void refreshDownloads() }, { tone: 'success', title: `${what} downloaded`, body: label })

  return (
    <>
      <PageHeader
        title="Reports"
        sub="Complaints registered and closed, backlog, resolution time and handoffs — computed from the case records and the audit log."
        actions={
          <div className="flex gap-2 print:hidden">
            <Button disabled={pdf.pending} onClick={() => download(pdf, () => api.reportPdf(query), 'PDF report')}>
              <FileText className="size-4" />{pdf.pending ? 'Preparing…' : 'Download PDF'}
            </Button>
            <Button variant="secondary" disabled={csv.pending} onClick={() => download(csv, () => api.reportCsv(query), 'CSV data')}>
              <FileDown className="size-4" />{csv.pending ? 'Preparing…' : 'Export data (CSV)'}
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex rounded-lg border border-zinc-300/80 bg-white p-0.5 shadow-xs">
          {periodTabs.map(({ key, label: text }) => (
            <button key={key} onClick={() => q.period !== key && setQ(initialQuery(key))}
              className={cn('relative rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors', q.period === key ? 'text-white' : 'text-zinc-600 hover:text-zinc-900')}>
              {q.period === key && (
                <motion.span layoutId="report-period" aria-hidden="true" className="absolute inset-0 rounded-md bg-zinc-900"
                  transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 480, damping: 36 }} />
              )}
              <span className="relative">{text}</span>
            </button>
          ))}
        </div>
        {q.period === 'week' && (
          <select className={cn(inputClass, 'w-60')} value={`${q.year}-${q.week}`} aria-label="Week"
            onChange={(e) => { const w = weeks.find((x) => x.key === e.target.value)!; setQ({ period: 'week', year: w.year, week: w.week }) }}>
            {weeks.map((w) => <option key={w.key} value={w.key}>{w.label}</option>)}
          </select>
        )}
        {q.period === 'month' && (
          <select className={cn(inputClass, 'w-40')} value={q.month} onChange={(e) => setQ({ ...q, month: Number(e.target.value) })} aria-label="Month">
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        )}
        {q.period !== 'week' && (
          <select className={cn(inputClass, 'w-28')} value={q.year} onChange={(e) => setQ({ ...q, year: Number(e.target.value) })} aria-label="Year">
            {years.map((y) => <option key={y}>{y}</option>)}
          </select>
        )}
        <button onClick={() => setVersion((v) => v + 1)} className="ml-1 inline-flex items-center gap-1.5 text-[12.5px] text-zinc-600 hover:text-zinc-900" title="Regenerate with the latest data">
          <RefreshCw className={cn('size-3.5', preview.pending && 'animate-spin')} />{preview.pending ? 'Generating…' : 'Regenerate'}
        </button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-zinc-200 bg-zinc-200 shadow-xs sm:grid-cols-3 xl:grid-cols-5">
        <Metric label="Registered" value={k?.received ?? null} prev={p?.received} note={data ? `vs ${data.previous.received} · ${data.period.previousLabel}` : ' '} />
        <Metric label="Closed" value={k?.resolved ?? null} prev={p?.resolved} note={data ? `vs ${data.previous.resolved} · ${data.period.previousLabel}` : ' '} />
        <Metric label={data?.period.inProgress ? 'Open now' : 'Open at end'} value={k?.openAtEnd ?? null} prev={p?.openAtEnd} invert note="Backlog" />
        <Metric label="Median days to close" value={k?.medianResolutionDays ?? null} prev={p?.medianResolutionDays} invert
          note={k?.resolvedWithin14d != null ? `${k.resolvedWithin14d}% within 14 days` : 'No cases closed'} />
        <Metric label="Report downloads" value={downloads?.thisWeek ?? null}
          note={downloads ? `this week · ${downloads.thisMonth} this month · ${downloads.total} total` : ' '} />
      </div>

      <Panel className="bg-zinc-100/70">
        {pdfUrl ? (
          <iframe key={pdfUrl} title={`Complaint handling report, ${label}`} src={`${pdfUrl}#view=FitH&toolbar=1`} className="block h-[calc(100vh-330px)] min-h-[620px] w-full bg-white" />
        ) : (
          <div className={cn('grid h-[60vh] place-items-center text-[13px] text-zinc-500', preview.pending && 'scanline')}>{preview.pending ? 'Generating the report…' : 'The report could not be generated.'}</div>
        )}
      </Panel>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-x-6 gap-y-2 text-[12px] text-zinc-500">
        <p>Previewing doesn’t count as a download. Weekly reports list every case registered and closed that week; the CSV has them all for any period.</p>
        {downloads && downloads.recent.length > 0 && (
          <p className="text-right">
            Last download: <span className="text-zinc-700">{downloads.recent[0].by}</span>, {downloads.recent[0].detail.replace(' report downloaded as ', ' · ')}, {ago(downloads.recent[0].at)}
          </p>
        )}
      </div>
    </>
  )
}
