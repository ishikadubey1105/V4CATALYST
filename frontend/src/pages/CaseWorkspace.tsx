import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import { format, parseISO } from 'date-fns'
import { ArrowRight, Forward, Plus, Printer, ShieldAlert, Upload } from 'lucide-react'
import { useMe, useRelations, useStore } from '../store/useStore'
import { api, useAction } from '../api'
import { useEmployee } from '../lib/hooks'
import { TaskTimeline } from '../components/flows'
import {
  Button, ButtonLink, DocType, DueLabel, Empty, Field, KeyValue, Label, Modal, PageHeader, Panel, PanelHeader, Person, Pipeline,
  PriorityLabel, RoleLabel, StageLabel, Tabs, inputClass, tdClass, thClass,
} from '../components/ui'
import {
  canEditCase, canForceReassign, canForward, canViewCase, caseRole, isReadOnly, stageMoveBlocked, stages,
} from '../lib/permissions'
import { ago, cn, dueState, fmtDate, fmtDateTime, formatBytes, reasonLabel } from '../lib/utils'
import type { Case, Handoff, OwnershipEntry, Stage, Task } from '../lib/types'

type TabKey = 'overview' | 'context' | 'documents' | 'actions' | 'flow' | 'history'

export default function CaseWorkspace() {
  const { id } = useParams()
  const me = useMe()!
  const rel = useRelations()
  const emp = useEmployee()
  const s = useStore()
  const c = s.cases.find((x) => x.id === id)
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as TabKey) || 'overview'
  const [reassignOpen, setReassignOpen] = useState(false)
  const { run } = useAction()
  const allowed = !!c && canViewCase(me, c, rel)

  useEffect(() => { if (c && !allowed) void api.reportAccessDenied(c.id) }, [c?.id, allowed]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!c) return <Panel><Empty title="Case not found" action={<ButtonLink to="/cases" variant="secondary">Back to register</ButtonLink>} /></Panel>
  if (!allowed) {
    return (
      <Panel className="mx-auto mt-10 max-w-md p-6">
        <div className="font-mono text-xs text-red-700">403 · NO RELATIONSHIP TO {c.code}</div>
        <h1 className="mt-1 text-lg font-semibold">You can't open this case</h1>
        <p className="mt-2 text-[13px] text-zinc-600">You are not its owner, an incoming receiver, a task assignee or a previous owner. This attempt has been logged.</p>
        <ButtonLink to="/cases" variant="secondary" className="mt-4">Back to register</ButtonLink>
      </Panel>
    )
  }

  const role = caseRole(me, c, rel)
  const editable = canEditCase(me, c)
  const draft = s.drafts[c.id]
  const pending = s.handoffs.find((h) => h.caseId === c.id && h.status === 'submitted')
  const counts = {
    context: s.decisions.filter((d) => d.caseId === c.id).length + s.questions.filter((q) => q.caseId === c.id && !q.answer).length,
    documents: s.docs.filter((d) => d.caseId === c.id).length,
    actions: s.tasks.filter((t) => t.caseId === c.id && !t.done).length,
  }

  const move = (to: Stage) => run(() => api.moveStage(c.id, to), { tone: 'success', title: `${c.code} moved to ${stages.find((x) => x.key === to)?.label}` })

  return (
    <>
      <PageHeader
        crumb={<><Link to="/cases" className="hover:underline">Cases</Link> / <span className="font-mono">{c.code}</span></>}
        title={c.title}
        sub={<>{c.complainant} · via {c.channel} · received {fmtDate(c.receivedAt)} · updated {ago(c.updatedAt)}</>}
        actions={<>
          {canForceReassign(me, c) && <Button variant="secondary" onClick={() => setReassignOpen(true)}><ShieldAlert className="size-3.5" />Reassign (admin)</Button>}
          {canForward(me, c) && <ButtonLink to={`/cases/${c.id}/forward`}><Forward className="size-3.5" />Forward case</ButtonLink>}
        </>}
      />

      <div className="no-print mb-4">
        <Pipeline
          stage={c.stage}
          onSelect={editable ? move : undefined}
          blockedReason={editable ? (to) => stageMoveBlocked(c, to, s.tasks) : undefined}
        />
        {editable && c.stage !== 'handoff' && <p className="mt-1 text-[11px] text-zinc-500">Click a stage to move the case. Hover a stage to see why a move is blocked.</p>}
      </div>

      <div className="no-print space-y-2">
        {draft && editable && (
          <Banner tone="blue">
            A forward of this case is being prepared. Fix the highlighted items, then
            <Link to={`/cases/${c.id}/forward?step=2`} className="ml-1 font-medium underline">return to the completeness check</Link>.
          </Banner>
        )}
        {pending && (
          <Banner tone="amber">
            Forwarded by {emp(pending.fromId)?.name} to <b>{emp(pending.toId)?.name}</b> ({reasonLabel[pending.reason].toLowerCase()}) — waiting for their decision.
            <Link to={`/handoffs/${pending.id}`} className="ml-1 font-medium underline">{pending.toId === me.id ? 'Review now' : 'View'}</Link>
          </Banner>
        )}
        {isReadOnly(me) && <Banner tone="neutral">Read-only session. Editing is disabled for auditors.</Banner>}
      </div>

      <div className="mt-4 grid gap-5 xl:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <Tabs
            value={tab}
            onChange={(t) => setParams({ tab: t })}
            items={[
              { key: 'overview', label: 'Overview' },
              { key: 'context', label: 'Context & decisions', count: counts.context },
              { key: 'documents', label: 'Documents', count: counts.documents },
              { key: 'actions', label: 'Actions', count: counts.actions },
              { key: 'flow', label: 'Timeline flow' },
              { key: 'history', label: 'History' },
            ]}
          />
          <div className="mt-4">
            {tab === 'overview' && <Overview c={c} />}
            {tab === 'context' && <ContextTab c={c} editable={editable} />}
            {tab === 'documents' && <DocumentsTab c={c} editable={editable} />}
            {tab === 'actions' && <ActionsTab c={c} editable={editable} highlight={params.get('highlight')} />}
            {tab === 'flow' && <TaskTimeline caseIds={[c.id]} height={360} />}
            {tab === 'history' && <HistoryTab c={c} />}
          </div>
        </div>

        <aside className="space-y-4">
          <Panel>
            <PanelHeader title="Case details" />
            <div className="p-4">
              <KeyValue items={[
                ['Your role', <RoleLabel role={role} />],
                ['Owner', <Person user={emp(c.ownerId)} sub={emp(c.ownerId)?.department} size="xs" />],
                ['Stage', <StageLabel stage={c.stage} />],
                ['Priority', <PriorityLabel priority={c.priority} />],
                ['Category', c.category],
                ['Registered by', emp(c.createdBy)?.name ?? '—'],
                ['Received', <span className="font-mono text-xs">{fmtDateTime(c.receivedAt)}</span>],
              ]} />
            </div>
          </Panel>
          <Panel>
            <PanelHeader title="People on this case" />
            <ul className="divide-y divide-zinc-100">
              {peopleOn(c, s.tasks, s.handoffs, s.ownership).map(({ userId, label }) => (
                <li key={userId + label} className="flex items-center justify-between gap-2 px-4 py-2">
                  <Person user={emp(userId)} sub={emp(userId)?.department} size="xs" />
                  <span className="text-[11px] text-zinc-500">{label}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </aside>
      </div>

      <ReassignModal c={c} open={reassignOpen} onClose={() => setReassignOpen(false)} />
    </>
  )
}

function Banner({ tone, children }: { tone: 'blue' | 'amber' | 'neutral'; children: ReactNode }) {
  const cls = { blue: 'border-blue-300 bg-blue-50 text-blue-900', amber: 'border-amber-300 bg-amber-50 text-amber-900', neutral: 'border-zinc-300 bg-white text-zinc-700' }[tone]
  return <div className={cn('rounded border px-3 py-2 text-[13px]', cls)}>{children}</div>
}

function peopleOn(c: Case, tasks: Task[], handoffs: Handoff[], ownership: OwnershipEntry[]) {
  const out: { userId: string; label: string }[] = [{ userId: c.ownerId, label: 'Owner' }]
  handoffs.filter((h) => h.caseId === c.id && h.status === 'submitted').forEach((h) => out.push({ userId: h.toId, label: 'Incoming owner' }))
  new Set(tasks.filter((t) => t.caseId === c.id && !t.done && t.ownerId && t.ownerId !== c.ownerId).map((t) => t.ownerId!))
    .forEach((u) => out.push({ userId: u, label: 'Task assignee' }))
  new Set(ownership.filter((o) => o.caseId === c.id && o.to).map((o) => o.userId))
    .forEach((u) => !out.some((x) => x.userId === u) && out.push({ userId: u, label: 'Previous owner' }))
  return out
}

/* ---------------- Overview: one-page handoff package ---------------- */

function Overview({ c }: { c: Case }) {
  const { tasks, decisions, docs, notes, questions } = useStore()
  const emp = useEmployee()
  const open = tasks.filter((t) => t.caseId === c.id && !t.done)
  const ds = decisions.filter((d) => d.caseId === c.id)
  const fs = docs.filter((d) => d.caseId === c.id)
  const ns = notes.filter((n) => n.caseId === c.id)
  const openQ = questions.filter((q) => q.caseId === c.id && !q.answer)

  return (
    <Panel>
      <PanelHeader
        title="Case on one page"
        sub="Everything a new owner needs, in reading order"
        action={<Button variant="ghost" size="sm" onClick={() => window.print()} className="no-print"><Printer className="size-3.5" />Print</Button>}
      />
      <div className="divide-y divide-zinc-100">
        <Block n="1" title="Summary"><p className="leading-relaxed text-zinc-800">{c.summary}</p></Block>
        <Block n="2" title={`Context (${ns.length})`}>
          {ns.length === 0 ? <None /> : ns.map((n) => <p key={n.id} className="mb-1.5"><b className="font-medium">{n.title}.</b> <span className="text-zinc-700">{n.body}</span></p>)}
        </Block>
        <Block n="3" title={`Decisions (${ds.length})`}>
          {ds.length === 0 ? <None /> : (
            <ol className="list-decimal space-y-1 pl-4">{ds.map((d) => <li key={d.id}><span className="font-medium">{d.title}</span> <span className="text-zinc-600">— {d.rationale}</span></li>)}</ol>
          )}
        </Block>
        <Block n="4" title={`Open actions (${open.length})`}>
          {open.length === 0 ? <None /> : (
            <table className="w-full"><tbody className="divide-y divide-zinc-100">
              {open.map((t) => <tr key={t.id}><td className="py-1.5">{t.title}</td><td className="py-1.5"><Person user={emp(t.ownerId)} size="xs" /></td><td className="py-1.5 text-right"><DueLabel task={t} /></td></tr>)}
            </tbody></table>
          )}
        </Block>
        <Block n="5" title={`Documents (${fs.length})`}>
          {fs.length === 0 ? <None /> : <div className="flex flex-wrap gap-2">{fs.map((f) => <span key={f.id} className="inline-flex items-center gap-1.5 rounded border border-zinc-200 py-0.5 pl-0.5 pr-2 text-xs"><DocType kind={f.kind} />{f.name}</span>)}</div>}
        </Block>
        <Block n="6" title={`Open questions (${openQ.length})`}>
          {openQ.length === 0 ? <span className="text-zinc-500">None — all answered.</span> : openQ.map((q) => <p key={q.id} className="text-amber-900">“{q.text}” — {emp(q.by)?.name}</p>)}
        </Block>
      </div>
    </Panel>
  )
}

const Block = ({ n, title, children }: { n: string; title: string; children: ReactNode }) => (
  <div className="grid gap-2 px-4 py-3 text-[13px] md:grid-cols-[160px_1fr]">
    <div className="text-xs font-semibold text-zinc-500"><span className="mr-1.5 font-mono text-zinc-400">{n}</span>{title}</div>
    <div>{children}</div>
  </div>
)
const None = () => <span className="text-zinc-400">Nothing recorded.</span>

/* ---------------- Context & decisions ---------------- */

function ContextTab({ c, editable }: { c: Case; editable: boolean }) {
  const me = useMe()!
  const { notes, decisions, questions } = useStore()
  const { run, pending } = useAction()
  const emp = useEmployee()
  const [dec, setDec] = useState({ title: '', why: '' })
  const [note, setNote] = useState({ title: '', body: '' })
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [newQ, setNewQ] = useState('')
  const ds = decisions.filter((d) => d.caseId === c.id).sort((a, b) => b.at.localeCompare(a.at))
  const qs = questions.filter((q) => q.caseId === c.id).sort((a, b) => Number(!!a.answer) - Number(!!b.answer))
  const ns = notes.filter((n) => n.caseId === c.id)

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader title="Questions" sub="Unanswered questions block forwarding" />
        <ul className="divide-y divide-zinc-100">
          {qs.map((q) => (
            <li key={q.id} className={cn('px-4 py-3', !q.answer && 'bg-amber-50/60')}>
              <div className="flex items-center gap-2 text-xs text-zinc-500"><Person user={emp(q.by)} size="xs" /><span>· {ago(q.at)}</span>{!q.answer && <Label tone="amber">Open</Label>}</div>
              <p className="mt-1 text-[13px]">{q.text}</p>
              {q.answer ? (
                <p className="mt-1.5 border-l-2 border-green-600 pl-2 text-[13px] text-zinc-700"><b className="font-medium">{emp(q.answeredBy)?.name}:</b> {q.answer}</p>
              ) : editable && (
                <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (answers[q.id]?.trim()) run(() => api.answerQuestion(q.id, answers[q.id].trim())) }}>
                  <input className={inputClass} placeholder="Answer…" value={answers[q.id] ?? ''} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} />
                  <Button type="submit" disabled={!answers[q.id]?.trim()}>Answer</Button>
                </form>
              )}
            </li>
          ))}
          {qs.length === 0 && <li><Empty title="No questions" /></li>}
        </ul>
        {!isReadOnly(me) && (
          <form className="flex gap-2 border-t border-zinc-200 p-3" onSubmit={(e) => { e.preventDefault(); if (newQ.trim()) run(() => api.askQuestion(c.id, newQ.trim())).then(() => setNewQ('')) }}>
            <input className={inputClass} placeholder="Ask a question about this case…" value={newQ} onChange={(e) => setNewQ(e.target.value)} />
            <Button type="submit" variant="secondary" disabled={!newQ.trim()}>Ask</Button>
          </form>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Decision log" sub="What was decided, why, and by whom" />
          <table className="w-full text-[13px]">
            <tbody className="divide-y divide-zinc-100">
              {ds.map((d) => (
                <tr key={d.id}>
                  <td className="w-24 px-4 py-2 align-top font-mono text-[11px] text-zinc-500">{fmtDate(d.at)}</td>
                  <td className="py-2 pr-4"><div className="font-medium">{d.title}</div><div className="text-zinc-600">{d.rationale}</div><div className="mt-0.5 text-[11px] text-zinc-500">{emp(d.by)?.name}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
          {ds.length === 0 && <Empty title="No decisions logged" body="Record at least one before forwarding." />}
          {editable && (
            <form className="space-y-2 border-t border-zinc-200 p-3" onSubmit={(e) => { e.preventDefault(); run(() => api.createDecision(c.id, { title: dec.title.trim(), rationale: dec.why.trim() })).then(() => setDec({ title: '', why: '' })) }}>
              <input className={inputClass} placeholder="Decision" value={dec.title} onChange={(e) => setDec({ ...dec, title: e.target.value })} />
              <input className={inputClass} placeholder="Reason" value={dec.why} onChange={(e) => setDec({ ...dec, why: e.target.value })} />
              <Button type="submit" size="sm" disabled={pending || !dec.title.trim() || !dec.why.trim()}><Plus className="size-3.5" />Log decision</Button>
            </form>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Context notes" sub="Background, contacts, sensitivities" />
          <ul className="divide-y divide-zinc-100">
            {ns.map((n) => (
              <li key={n.id} className="px-4 py-2 text-[13px]">
                <div className="font-medium">{n.title}</div>
                <p className="text-zinc-700">{n.body}</p>
                <div className="mt-0.5 text-[11px] text-zinc-500">{emp(n.by)?.name} · {ago(n.at)}</div>
              </li>
            ))}
          </ul>
          {ns.length === 0 && <Empty title="No notes yet" />}
          {editable && (
            <form className="space-y-2 border-t border-zinc-200 p-3" onSubmit={(e) => { e.preventDefault(); run(() => api.createNote(c.id, { title: note.title.trim(), body: note.body.trim() })).then(() => setNote({ title: '', body: '' })) }}>
              <input className={inputClass} placeholder="Title" value={note.title} onChange={(e) => setNote({ ...note, title: e.target.value })} />
              <textarea className={inputClass} rows={2} placeholder="Note" value={note.body} onChange={(e) => setNote({ ...note, body: e.target.value })} />
              <Button type="submit" size="sm" disabled={!note.title.trim() || !note.body.trim()}><Plus className="size-3.5" />Add note</Button>
            </form>
          )}
        </Panel>
      </div>
    </div>
  )
}

/* ---------------- Documents ---------------- */

function DocumentsTab({ c, editable }: { c: Case; editable: boolean }) {
  const { docs, toast } = useStore()
  const { run } = useAction()
  const emp = useEmployee()
  const fs = docs.filter((d) => d.caseId === c.id).sort((a, b) => b.at.localeCompare(a.at))
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    disabled: !editable,
    maxSize: 25_000_000,
    onDrop: (accepted, rejected) => {
      if (rejected.length) toast({ tone: 'warning', title: `${rejected.length} file(s) rejected`, body: 'Maximum size is 25 MB.' })
      if (!accepted.length) return
      run(() => api.uploadDocuments(c.id, accepted), { tone: 'success', title: `${accepted.length} file${accepted.length > 1 ? 's' : ''} attached` })
    },
  })

  return (
    <Panel>
      <PanelHeader title="Documents" sub="Evidence, correspondence and working files" />
      {editable && (
        <div {...getRootProps()} className={cn('m-3 flex cursor-pointer items-center justify-center gap-2 rounded border border-dashed px-4 py-5 text-[13px]', isDragActive ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-zinc-300 text-zinc-600 hover:bg-zinc-50')}>
          <input {...getInputProps()} />
          <Upload className="size-4" />{isDragActive ? 'Drop to attach' : 'Drop files here or click to browse (max 25 MB)'}
        </div>
      )}
      {fs.length === 0 ? <Empty title="No documents" body="A case cannot be forwarded without at least one document." /> : (
        <table className="w-full text-[13px]">
          <thead className="bg-zinc-50"><tr><th className={thClass}>File</th><th className={thClass}>Size</th><th className={thClass}>Uploaded by</th><th className={thClass}>When</th></tr></thead>
          <tbody className="divide-y divide-zinc-100">
            {fs.map((f) => (
              <tr key={f.id}>
                <td className={tdClass}><span className="flex items-center gap-2"><DocType kind={f.kind} />{f.name}</span></td>
                <td className={cn(tdClass, 'font-mono text-xs text-zinc-600')}>{formatBytes(f.size)}</td>
                <td className={tdClass}><Person user={emp(f.by)} size="xs" /></td>
                <td className={cn(tdClass, 'font-mono text-xs text-zinc-500')}>{fmtDateTime(f.at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  )
}

/* ---------------- Actions ---------------- */

function ActionsTab({ c, editable, highlight }: { c: Case; editable: boolean; highlight: string | null }) {
  const me = useMe()!
  const { tasks, employees } = useStore()
  const { run } = useAction()
  const updateTask = (id: string, patch: Parameters<typeof api.updateTask>[1]) => run(() => api.updateTask(id, patch))
  const [title, setTitle] = useState('')
  const list = tasks.filter((t) => t.caseId === c.id).sort((a, b) => Number(a.done) - Number(b.done))
  const assignable = employees.filter((u) => u.active && u.orgRole !== 'auditor')

  useEffect(() => {
    if (highlight) document.getElementById(`task-${highlight}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlight])

  return (
    <Panel>
      <PanelHeader title="Actions & deadlines" sub="Every open task needs an assignee and a deadline before the case can be forwarded" />
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="bg-zinc-50"><tr><th className={cn(thClass, 'w-8')} /><th className={thClass}>Task</th><th className={thClass}>Assignee</th><th className={thClass}>Deadline</th><th className={thClass}>Status</th></tr></thead>
          <tbody className="divide-y divide-zinc-100">
            {list.map((t) => {
              // Assignees can tick off their own task even if they don't own the case.
              const canTick = (editable || t.ownerId === me.id) && !isReadOnly(me)
              const missingOwner = !t.done && !t.ownerId
              const missingDue = !t.done && !t.due
              return (
                <tr key={t.id} id={`task-${t.id}`} className={cn(highlight === t.id && 'highlight-row', dueState(t) === 'overdue' && 'bg-red-50/50')}>
                  <td className={tdClass}><input type="checkbox" checked={t.done} disabled={!canTick} onChange={(e) => updateTask(t.id, { done: e.target.checked })} className="size-4 accent-zinc-900" /></td>
                  <td className={cn(tdClass, t.done && 'text-zinc-400 line-through')}>{t.title}</td>
                  <td className={tdClass}>
                    <select
                      value={t.ownerId ?? ''} disabled={!editable || t.done}
                      onChange={(e) => updateTask(t.id, { ownerId: e.target.value || undefined })}
                      className={cn(inputClass, 'w-48 py-1', missingOwner && 'border-amber-500 bg-amber-50')}
                    >
                      <option value="">— Unassigned —</option>
                      {assignable.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </td>
                  <td className={tdClass}>
                    <input
                      type="date" disabled={!editable || t.done}
                      value={t.due ? format(parseISO(t.due), 'yyyy-MM-dd') : ''}
                      onChange={(e) => updateTask(t.id, { due: e.target.value ? new Date(e.target.value + 'T23:59:59').toISOString() : undefined })}
                      className={cn(inputClass, 'w-36 py-1 font-mono text-xs', missingDue && 'border-amber-500 bg-amber-50')}
                    />
                  </td>
                  <td className={tdClass}><DueLabel task={t} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {list.length === 0 && <Empty title="No tasks yet" />}
      {editable && (
        <form className="flex gap-2 border-t border-zinc-200 p-3" onSubmit={(e) => { e.preventDefault(); if (title.trim()) run(() => api.createTask(c.id, title.trim())).then(() => setTitle('')) }}>
          <input className={inputClass} placeholder="New task…" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Button type="submit" variant="secondary" disabled={!title.trim()}><Plus className="size-3.5" />Add task</Button>
        </form>
      )}
    </Panel>
  )
}

/* ---------------- History ---------------- */

function HistoryTab({ c }: { c: Case }) {
  const { ownership, audit } = useStore()
  const emp = useEmployee()
  const chain = ownership.filter((o) => o.caseId === c.id)
  const events = audit.filter((a) => a.caseId === c.id).sort((a, b) => b.at.localeCompare(a.at))

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader title="Ownership chain" sub="Every accountable owner, how they got the case, and for how long" />
        <div className="flex flex-wrap items-stretch gap-2 p-4">
          {chain.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={cn('w-60 rounded border p-3', !o.to ? 'border-zinc-900' : 'border-zinc-200')}>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-zinc-500">#{i + 1} · {o.via}</span>
                  {!o.to ? <Label tone="blue">Current</Label> : o.via === 'forced' ? <Label tone="red">Admin override</Label> : null}
                </div>
                <div className="mt-1.5"><Person user={emp(o.userId)} sub={emp(o.userId)?.department} /></div>
                <div className="mt-2 font-mono text-[11px] text-zinc-600">{fmtDateTime(o.from)}<br />→ {o.to ? fmtDateTime(o.to) : 'present'}</div>
                {o.reason && <div className="mt-1.5 border-t border-zinc-100 pt-1.5 text-[11px] text-zinc-600">Reason: {o.reason}</div>}
              </div>
              {i < chain.length - 1 && <ArrowRight className="size-4 text-zinc-400" />}
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="Activity" sub={`${events.length} audit entries for this case`} />
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <tbody className="divide-y divide-zinc-100">
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="w-40 whitespace-nowrap px-4 py-2 font-mono text-[11px] text-zinc-500">{fmtDateTime(e.at)}</td>
                  <td className="w-36 py-2">{emp(e.actorId)?.name ?? <span className="text-zinc-500">System</span>}</td>
                  <td className="w-44 py-2"><code className="font-mono text-[11px] text-zinc-700">{e.action}</code></td>
                  <td className="py-2 pr-4 text-zinc-700">{e.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}

/* ---------------- Admin: reassign ---------------- */

function ReassignModal({ c, open, onClose }: { c: Case; open: boolean; onClose: () => void }) {
  const { employees } = useStore()
  const { run, pending } = useAction()
  const [toId, setToId] = useState('')
  const [reason, setReason] = useState('')
  const candidates = employees.filter((u) => u.id !== c.ownerId && u.active && u.orgRole !== 'auditor')
  const valid = toId && reason.trim().length >= 10

  return (
    <Modal
      open={open} onClose={onClose} title={`Reassign ${c.code} (admin override)`}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="danger" disabled={!valid || pending} onClick={async () => {
          await run(() => api.reassign(c.id, { toId, reason: reason.trim() }), { tone: 'warning', title: 'Case reassigned', body: 'Your name and reason are in the audit log.' })
          setToId(''); setReason(''); onClose()
        }}>Reassign now</Button>
      </>}
    >
      <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
        This skips the completeness check and the receiver's acknowledgement. Use only when the owner is unavailable.
      </p>
      <div className="space-y-3">
        <Field label="New owner">
          <select className={inputClass} value={toId} onChange={(e) => setToId(e.target.value)}>
            <option value="">Select employee…</option>
            {candidates.map((u) => <option key={u.id} value={u.id}>{u.name} — {u.department}</option>)}
          </select>
        </Field>
        <Field label="Reason" hint="min. 10 characters, permanently logged">
          <textarea className={inputClass} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Owner on unplanned leave; customer deadline in 2 days" />
        </Field>
      </div>
    </Modal>
  )
}
