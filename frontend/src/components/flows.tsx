import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { addDays, differenceInCalendarDays, format, parseISO, startOfDay } from 'date-fns'
import {
  AlarmClock, ArrowRightLeft, CheckCircle2, FileSearch, Forward, GitBranch, Inbox, ListChecks, MessageCircleQuestion,
  ShieldCheck, Timer, UserCheck, Wrench, Wand2, FolderOpen,
} from 'lucide-react'
import { useStore } from '../store/useStore'
import { useEmployee, useVisibleCases } from '../lib/hooks'
import { runCompleteness } from '../lib/completeness'
import { ago, dueState, fmtDate, reasonLabel } from '../lib/utils'
import { FlowCanvas, type FlowEdge, type FlowNode, type NodeTone } from './FlowCanvas'
import { DueLabel, Empty, Label, Panel, PanelHeader, Person, StageLabel } from './ui'
import type { Case, Task } from '../lib/types'

/* =====================================================================
 * Process flow — the complaint lifecycle as an n8n-style workflow,
 * with live counts on every node and an inspector for the selected node.
 * ===================================================================== */

// Three rows: main pipeline (A), forwarding branch (B), loops and alerts (C)
const A = 150
const B = 320
const C = 540

export function ProcessFlow() {
  const s = useStore()
  const emp = useEmployee()
  const visible = useVisibleCases()
  const [sel, setSel] = useState<string | null>('overdue')
  const ids = new Set(visible.map((c) => c.id))
  const caseOf = (id: string) => s.cases.find((c) => c.id === id)!

  const g = useMemo(() => {
    const inStage = (st: Case['stage']) => visible.filter((c) => c.stage === st)
    const drafts = Object.entries(s.drafts).filter(([cid]) => ids.has(cid)).map(([cid, d]) => ({
      c: caseOf(cid), d, check: runCompleteness({ caseId: cid, draft: d, tasks: s.tasks, decisions: s.decisions, docs: s.docs, questions: s.questions }),
    }))
    const blocked = drafts.filter((x) => !x.check.ok)
    const failing = drafts.flatMap((x) => x.check.items.filter((i) => !i.pass).map((i) => ({ ...i, c: x.c })))
    const submitted = s.handoffs.filter((h) => h.status === 'submitted' && ids.has(h.caseId))
    const handoffCases = new Set(submitted.map((h) => h.caseId))
    const qa = s.questions.filter((q) => handoffCases.has(q.caseId))
    const openQa = qa.filter((q) => !q.answer)
    const ready = submitted.filter((h) => Object.values(h.acks).every(Boolean) && !s.questions.some((q) => q.caseId === h.caseId && !q.answer))
    const transfers = s.ownership.filter((o) => ids.has(o.caseId) && o.via !== 'created').sort((a, b) => b.from.localeCompare(a.from))
    const openTasks = s.tasks.filter((t) => ids.has(t.caseId) && !t.done)
    const watched = openTasks.filter((t) => t.due)
    const overdue = openTasks.filter((t) => dueState(t) === 'overdue')
    return { inStage, drafts, blocked, failing, submitted, qa, openQa, ready, transfers, watched, overdue }
  }, [s, visible]) // eslint-disable-line react-hooks/exhaustive-deps

  const nodes: FlowNode[] = [
    { id: 'received', x: 40, y: A, tone: 'trigger', icon: Inbox, title: 'Complaint received', sub: 'Trigger · stage 01', badge: g.inStage('received').length },
    { id: 'investigation', x: 320, y: A, tone: 'stage', icon: FileSearch, title: 'Investigation', sub: 'Stage 02', badge: g.inStage('investigation').length },
    { id: 'action', x: 600, y: A, tone: 'stage', icon: Wrench, title: 'Action', sub: 'Stage 03', badge: g.inStage('action').length },
    { id: 'resolved', x: 880, y: A, tone: 'end', icon: CheckCircle2, title: 'Resolved', sub: 'Stage 05 · end', badge: g.inStage('resolved').length },
    { id: 'forward', x: 320, y: B, tone: 'action', icon: Forward, title: 'Forward drafted', sub: 'Recipient + reason + note', badge: g.drafts.length },
    {
      id: 'check', x: 600, y: B, tone: 'gate', icon: ShieldCheck, title: 'Completeness check', sub: 'IF all 8 checks pass', badge: g.drafts.length,
      status: g.drafts.length ? { text: `${g.blocked.length} blocked · ${g.drafts.length - g.blocked.length} ready`, tone: g.blocked.length ? 'red' : 'green' } : undefined,
    },
    { id: 'fix', x: 600, y: C, tone: 'alert', icon: Wand2, title: 'Fix highlighted gaps', sub: 'Owner fixes, then re-check', badge: g.failing.length },
    { id: 'review', x: 880, y: B, tone: 'stage', icon: UserCheck, title: 'Receiver review', sub: 'Stage 04 · acknowledge 5 sections', badge: g.submitted.length },
    { id: 'qa', x: 880, y: C, tone: 'action', icon: MessageCircleQuestion, title: 'Clarification Q&A', sub: 'Receiver ↔ sender', badge: g.qa.length, status: g.openQa.length ? { text: `${g.openQa.length} unanswered`, tone: 'amber' } : undefined },
    { id: 'decision', x: 1160, y: B, tone: 'gate', icon: GitBranch, title: 'Accept or reject', sub: 'IF acknowledged + no open Qs', badge: g.ready.length, status: g.submitted.length ? { text: `${g.ready.length} ready to accept`, tone: g.ready.length ? 'green' : 'neutral' } : undefined },
    { id: 'transferred', x: 1160, y: A, tone: 'end', icon: ArrowRightLeft, title: 'Ownership transferred', sub: 'Chain + audit updated', badge: g.transfers.length },
    { id: 'watcher', x: 40, y: B, tone: 'action', icon: Timer, title: 'Deadline watcher', sub: 'Scheduled · every minute', badge: g.watched.length },
    { id: 'overdue', x: 40, y: C, tone: 'alert', icon: AlarmClock, title: 'Overdue notifications', sub: 'Assignee + owner alerted', badge: g.overdue.length, status: g.overdue.length ? { text: `${g.overdue.length} overdue now`, tone: 'red' } : undefined },
  ]

  const edges: FlowEdge[] = [
    { from: 'received', to: 'investigation' },
    { from: 'investigation', to: 'action' },
    { from: 'action', to: 'resolved', label: 'all done', tone: 'pass' },
    { from: 'investigation', to: 'forward', fromSide: 'b', toSide: 't', label: 'owner forwards', dashed: true },
    { from: 'action', to: 'forward', fromSide: 'b', toSide: 't', dashed: true },
    { from: 'forward', to: 'check' },
    { from: 'check', to: 'review', label: 'pass', tone: 'pass' },
    { from: 'check', to: 'fix', fromSide: 'b', toSide: 't', label: 'fail → fix → re-check', tone: 'fail' },
    { from: 'review', to: 'qa', fromSide: 'b', toSide: 't', label: 'question ⇄ answer', dashed: true },
    { from: 'review', to: 'decision', label: '5/5 ack' },
    { from: 'decision', to: 'transferred', fromSide: 't', toSide: 'b', label: 'accept', tone: 'pass' },
    { from: 'decision', to: 'forward', fromSide: 'b', toSide: 'b', label: 'reject → back to sender', tone: 'fail', dashed: true },
    { from: 'transferred', to: 'action', fromSide: 't', toSide: 't', label: 'new owner continues', tone: 'muted', dashed: true },
    { from: 'received', to: 'watcher', fromSide: 'b', toSide: 't', label: 'monitors deadlines', tone: 'muted', dashed: true },
    { from: 'watcher', to: 'overdue', fromSide: 'b', toSide: 't', label: 'past due', tone: 'fail' },
  ]

  const caseRow = (c: Case, right?: ReactNode) => (
    <li key={c.id} className="flex items-center justify-between gap-2 px-4 py-2">
      <Link to={`/cases/${c.id}`} className="min-w-0 hover:underline"><span className="mr-1.5 font-mono text-[11px] text-zinc-500">{c.code}</span><span className="text-[13px]">{c.title}</span></Link>
      {right}
    </li>
  )
  const taskRow = (t: Task) => (
    <li key={t.id} className="px-4 py-2">
      <Link to={`/cases/${t.caseId}?tab=actions&highlight=${t.id}`} className="block text-[13px] hover:underline">{t.title}</Link>
      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500"><span className="font-mono">{caseOf(t.caseId).code}</span><Person user={emp(t.ownerId)} size="xs" /><DueLabel task={t} /></div>
    </li>
  )

  const inspector: Record<string, { title: string; help: string; body: ReactNode }> = {
    received: { title: 'Complaint received', help: 'New complaints registered and acknowledged.', body: g.inStage('received').map((c) => caseRow(c)) },
    investigation: { title: 'Investigation', help: 'Facts, evidence and root cause being gathered.', body: g.inStage('investigation').map((c) => caseRow(c, <Person user={emp(c.ownerId)} size="xs" />)) },
    action: { title: 'Action', help: 'Remedy agreed and being delivered.', body: g.inStage('action').map((c) => caseRow(c, <Person user={emp(c.ownerId)} size="xs" />)) },
    resolved: { title: 'Resolved', help: 'Closed with the complainant. Requires every task to be done.', body: g.inStage('resolved').map((c) => caseRow(c)) },
    forward: { title: 'Forward drafted', help: 'Owners preparing to hand a case to another employee.', body: g.drafts.map(({ c, d }) => caseRow(c, <span className="text-[11px] text-zinc-500">→ {emp(d.toId)?.name ?? '?'}{d.reason ? ` · ${d.reason}` : ''}</span>)) },
    check: { title: 'Completeness check', help: 'Blocks the forward until every task has an owner and deadline, questions are answered, and context exists.', body: g.drafts.map(({ c, check }) => caseRow(c, <Label tone={check.ok ? 'green' : 'red'}>{check.passed}/{check.total}</Label>)) },
    fix: {
      title: 'Fix highlighted gaps', help: 'Each failing check, with a direct link to where it is fixed.',
      body: g.failing.map((f, i) => (
        <li key={i} className="px-4 py-2 text-[13px]">
          <div className="font-medium">{f.label} <span className="font-mono text-[11px] text-zinc-500">{f.c.code}</span></div>
          <div className="text-xs text-red-800">{f.detail}</div>
          <Link to={f.fix} className="text-xs text-blue-700 hover:underline">{f.fixLabel} →</Link>
        </li>
      )),
    },
    review: {
      title: 'Receiver review', help: 'Forwarded cases waiting for the receiver to acknowledge each section.',
      body: g.submitted.map((h) => (
        <li key={h.id} className="px-4 py-2">
          <Link to={`/handoffs/${h.id}`} className="text-[13px] hover:underline"><span className="mr-1.5 font-mono text-[11px] text-zinc-500">{caseOf(h.caseId).code}</span>{caseOf(h.caseId).title}</Link>
          <div className="mt-0.5 text-[11px] text-zinc-500">{emp(h.fromId)?.name} → {emp(h.toId)?.name} · {reasonLabel[h.reason]} · {Object.values(h.acks).filter(Boolean).length}/5 acked</div>
        </li>
      )),
    },
    qa: {
      title: 'Clarification Q&A', help: 'Questions on cases that are being handed over.',
      body: g.qa.map((q) => (
        <li key={q.id} className="px-4 py-2 text-[13px]">
          <div>{q.text}</div>
          <div className="text-[11px] text-zinc-500">{emp(q.by)?.name} · {ago(q.at)} · {q.answer ? <span className="text-green-700">answered</span> : <span className="text-amber-700">open</span>}</div>
        </li>
      )),
    },
    decision: { title: 'Accept or reject', help: 'Handoffs whose receiver has acknowledged everything and has no open questions.', body: g.ready.map((h) => caseRow(caseOf(h.caseId), <Link to={`/handoffs/${h.id}`} className="text-xs text-blue-700 hover:underline">open</Link>)) },
    transferred: {
      title: 'Ownership transferred', help: 'Every completed handoff and admin reassignment.',
      body: g.transfers.map((o, i) => (
        <li key={i} className="px-4 py-2 text-[13px]">
          <span className="mr-1.5 font-mono text-[11px] text-zinc-500">{caseOf(o.caseId).code}</span>→ {emp(o.userId)?.name}
          <div className="text-[11px] text-zinc-500">{o.via === 'forced' ? 'admin reassignment' : 'handoff'} · {fmtDate(o.from)}{o.reason ? ` · ${o.reason}` : ''}</div>
        </li>
      )),
    },
    watcher: { title: 'Deadline watcher', help: 'Open tasks with a deadline, earliest first.', body: [...g.watched].sort((a, b) => a.due!.localeCompare(b.due!)).map(taskRow) },
    overdue: { title: 'Overdue notifications', help: 'Past-due tasks. Assignee and case owner are notified once per task.', body: g.overdue.map(taskRow) },
  }
  const ins = sel ? inspector[sel] : null
  const empty = ins && Array.isArray(ins.body) && ins.body.length === 0

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
      <FlowCanvas nodes={nodes} edges={edges} selected={sel} onSelect={setSel} height={600} autoFit />
      <Panel className="h-fit xl:sticky xl:top-16">
        {ins ? (
          <>
            <PanelHeader title={ins.title} sub={ins.help} />
            {empty ? <Empty title="Nothing at this step right now" /> : <ul className="max-h-[460px] divide-y divide-zinc-100 overflow-y-auto">{ins.body}</ul>}
          </>
        ) : <Empty title="Select a node" body="Click any node to see the cases, tasks or handoffs currently at that step." />}
      </Panel>
    </div>
  )
}

/* =====================================================================
 * Task timeline — every task placed on a day axis by its deadline,
 * one lane per case, chained in due order like workflow steps.
 * ===================================================================== */

const DAY = 72
const TW = 180
const TH = 58
const X0 = 500 // timeline origin (after case + unscheduled columns)

export function TaskTimeline({ caseIds, showDone = true, height = 560 }: { caseIds?: string[]; showDone?: boolean; height?: number }) {
  const s = useStore()
  const emp = useEmployee()
  const visible = useVisibleCases()
  const [sel, setSel] = useState<string | null>(null)
  const cases = visible.filter((c) => (!caseIds || caseIds.includes(c.id)) && s.tasks.some((t) => t.caseId === c.id))

  const layout = useMemo(() => {
    const today = startOfDay(new Date())
    const tasks = s.tasks.filter((t) => cases.some((c) => c.id === t.caseId) && (showDone || !t.done))
    const dated = tasks.filter((t) => t.due).map((t) => startOfDay(parseISO(t.due!)))
    // Axis starts 3 days back; anything older is pinned to the first column so the view opens on "now".
    const start = addDays(today, -3)
    const end = addDays([addDays(today, 14), ...dated].reduce((a, b) => (a > b ? a : b)), 2)
    const days = differenceInCalendarDays(end, start)
    const xOf = (iso: string) => Math.max(X0 + 4, X0 + Math.max(0, differenceInCalendarDays(startOfDay(parseISO(iso)), start)) * DAY + DAY / 2 - TW / 2)

    const nodes: FlowNode[] = []
    const edges: FlowEdge[] = []
    const lanes: { y: number; h: number; c: Case }[] = []
    let y = 56
    for (const c of cases) {
      const ct = tasks.filter((t) => t.caseId === c.id)
      const datedT = ct.filter((t) => t.due).sort((a, b) => a.due!.localeCompare(b.due!))
      const undated = ct.filter((t) => !t.due)
      // pack dated tasks into rows so nodes never overlap
      const rowsRight: number[] = []
      const placed = datedT.map((t) => {
        const x = xOf(t.due!)
        let r = rowsRight.findIndex((right) => right + 14 <= x)
        if (r === -1) { r = rowsRight.length; rowsRight.push(0) }
        rowsRight[r] = x + TW
        return { t, x, r }
      })
      const rows = Math.max(1, rowsRight.length, undated.length)
      const h = rows * (TH + 14) + 22
      lanes.push({ y, h, c })
      nodes.push({ id: `case:${c.id}`, x: 20, y: y + 11, w: 220, h: TH, tone: 'trigger', icon: FolderOpen, title: c.code, sub: c.title, badge: ct.filter((t) => !t.done).length })
      undated.forEach((t, i) => {
        nodes.push(taskNode(t, 270, y + 11 + i * (TH + 14)))
        edges.push({ from: `case:${c.id}`, to: t.id, tone: 'muted', dashed: true })
      })
      placed.forEach(({ t, x, r }, i) => {
        nodes.push(taskNode(t, x, y + 11 + r * (TH + 14)))
        edges.push({ from: i === 0 ? `case:${c.id}` : placed[i - 1].t.id, to: t.id, tone: dueState(t) === 'overdue' ? 'fail' : t.done ? 'pass' : 'default' })
      })
      y += h
    }

    function taskNode(t: Task, x: number, ty: number): FlowNode {
      const st = dueState(t)
      const tone: NodeTone = st === 'done' ? 'done' : st === 'overdue' ? 'overdue' : st === 'soon' ? 'soon' : st === 'none' ? 'none' : 'ok'
      return {
        id: t.id, x, y: ty, w: TW, h: TH, tone, icon: st === 'done' ? CheckCircle2 : st === 'overdue' ? AlarmClock : ListChecks,
        title: t.title, sub: emp(t.ownerId)?.name ?? 'Unassigned',
        status: { text: st === 'none' ? 'no deadline' : st === 'done' ? 'done' : `${st === 'overdue' ? 'overdue · ' : ''}${format(parseISO(t.due!), 'dd MMM')}`, tone: st === 'overdue' ? 'red' : st === 'soon' ? 'amber' : st === 'done' ? 'green' : 'neutral' },
      }
    }

    const width = X0 + days * DAY + 40
    const todayX = X0 + differenceInCalendarDays(today, start) * DAY
    const underlay = (
      <div className="pointer-events-none absolute inset-0">
        {/* column headers */}
        <div className="absolute top-2 font-mono text-[10px] font-semibold uppercase tracking-wide text-zinc-500" style={{ left: 20 }}>Case</div>
        <div className="absolute top-2 font-mono text-[10px] font-semibold uppercase tracking-wide text-zinc-500" style={{ left: 270 }}>No deadline</div>
        <div className="absolute bottom-0 top-0 border-l border-zinc-300" style={{ left: 258 }} />
        <div className="absolute bottom-0 top-0 border-l-2 border-zinc-400" style={{ left: X0 - 10 }} />
        {Array.from({ length: days }).map((_, i) => {
          const d = addDays(start, i)
          const weekend = d.getDay() === 0 || d.getDay() === 6
          return (
            <div key={i} className={weekend ? 'absolute bottom-0 top-0 bg-zinc-200/50' : 'absolute bottom-0 top-0'} style={{ left: X0 + i * DAY, width: DAY }}>
              <div className="h-full border-l border-zinc-200" />
              <div className="absolute left-1 top-2 font-mono text-[10px] text-zinc-500">{i === 0 ? '≤ ' : ''}{format(d, d.getDate() === 1 || i === 0 ? 'dd MMM' : 'dd')}<span className="ml-0.5 text-zinc-400">{format(d, 'EEEEE')}</span></div>
            </div>
          )
        })}
        <div className="absolute bottom-0 top-0 w-0.5 bg-red-600/70" style={{ left: todayX + DAY / 2 }}>
          <span className="absolute left-1 top-7 rounded-sm bg-red-600 px-1 font-mono text-[9px] font-semibold text-white">TODAY</span>
        </div>
        {lanes.map((l) => <div key={l.c.id} className="absolute left-0 right-0 border-t border-zinc-300" style={{ top: l.y }} />)}
      </div>
    )
    return { nodes, edges, underlay, width, height: y + 20 }
  }, [s.tasks, cases.map((c) => c.id).join(), showDone]) // eslint-disable-line react-hooks/exhaustive-deps

  if (cases.length === 0) return <Panel><Empty title="No tasks to place on the timeline" /></Panel>

  const selTask = s.tasks.find((t) => t.id === sel)
  const selCase = sel?.startsWith('case:') ? s.cases.find((c) => `case:${c.id}` === sel) : null

  return (
    <div className="space-y-3">
      <FlowCanvas nodes={layout.nodes} edges={layout.edges} selected={sel} onSelect={setSel} underlay={layout.underlay} minWidth={layout.width} minHeight={layout.height} height={height} minZoom={0.3} />
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-600">
        <Legend cls="bg-red-600" label="Overdue" /><Legend cls="bg-amber-500" label="Due within 48h" /><Legend cls="bg-zinc-600" label="Scheduled" />
        <Legend cls="bg-green-600" label="Done" /><Legend cls="bg-zinc-300" label="No deadline (blocks forwarding)" />
        <span className="ml-auto">Drag the canvas to pan · click a node for details</span>
      </div>
      {(selTask || selCase) && (
        <Panel>
          {selTask && (
            <div className="flex flex-wrap items-center gap-4 px-4 py-3 text-[13px]">
              <span className="font-medium">{selTask.title}</span>
              <Person user={emp(selTask.ownerId)} size="xs" />
              <DueLabel task={selTask} />
              <Link to={`/cases/${selTask.caseId}?tab=actions&highlight=${selTask.id}`} className="ml-auto text-xs text-blue-700 hover:underline">Edit in case →</Link>
            </div>
          )}
          {selCase && (
            <div className="flex flex-wrap items-center gap-4 px-4 py-3 text-[13px]">
              <span className="font-mono text-xs text-zinc-500">{selCase.code}</span><span className="font-medium">{selCase.title}</span>
              <StageLabel stage={selCase.stage} /><Person user={emp(selCase.ownerId)} size="xs" />
              <Link to={`/cases/${selCase.id}`} className="ml-auto text-xs text-blue-700 hover:underline">Open case →</Link>
            </div>
          )}
        </Panel>
      )}
    </div>
  )
}

const Legend = ({ cls, label }: { cls: string; label: string }) => <span className="flex items-center gap-1.5"><span className={`size-2.5 rounded-sm ${cls}`} />{label}</span>
