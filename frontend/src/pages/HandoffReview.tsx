import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, Sparkles } from 'lucide-react'
import { useMe, useStore } from '../store/useStore'
import { api, useAction } from '../api'
import type { AiResult } from '../api/contracts'
import { AiInsights, AiSource } from '../components/AiAssist'
import { useEmployee } from '../lib/hooks'
import { Button, DocType, DueLabel, Empty, Field, Label, Modal, PageHeader, Panel, PanelHeader, Person, inputClass } from '../components/ui'
import { canActOnHandoff } from '../lib/permissions'
import { ago, cn, fmtDateTime, formatBytes, reasonLabel } from '../lib/utils'
import type { SectionKey } from '../lib/types'

export default function HandoffReview() {
  const { id } = useParams()
  const me = useMe()!
  const navigate = useNavigate()
  const s = useStore()
  const emp = useEmployee()
  const h = s.handoffs.find((x) => x.id === id)
  const [q, setQ] = useState('')
  const [answer, setAnswer] = useState<Record<string, string>>({})
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')
  const { run, pending } = useAction()
  const [brief, setBrief] = useState<AiResult | null>(null)
  const briefing = useAction()

  if (!h) return <Panel><Empty title="Handoff not found" /></Panel>
  const c = s.cases.find((x) => x.id === h.caseId)!
  const involved = [h.fromId, h.toId].includes(me.id) || me.orgRole !== 'employee'
  if (!involved) {
    return <Panel className="mx-auto mt-10 max-w-md p-6"><div className="font-mono text-xs text-red-700">403</div><p className="mt-1 text-[13px]">Only the sender, the receiver, admins and auditors can view this handoff.</p></Panel>
  }

  const from = emp(h.fromId)
  const to = emp(h.toId)
  const canAct = canActOnHandoff(me, h)
  const isSender = me.id === h.fromId
  const qs = s.questions.filter((x) => x.caseId === c.id)
  const openQs = qs.filter((x) => !x.answer)
  const ackCount = Object.values(h.acks).filter(Boolean).length
  const allAcked = ackCount === 5
  const canAccept = canAct && allAcked && openQs.length === 0
  const ds = s.decisions.filter((d) => d.caseId === c.id)
  const fs = s.docs.filter((d) => d.caseId === c.id)
  const ts = s.tasks.filter((t) => t.caseId === c.id && !t.done)
  const ns = s.notes.filter((n) => n.caseId === c.id)

  const sections: { key: SectionKey; title: string; body: ReactNode }[] = [
    {
      key: 'overview', title: 'Summary and handoff note',
      body: (
        <>
          <p className="text-zinc-800">{c.summary}</p>
          <div className="mt-2 border-l-2 border-zinc-900 bg-zinc-50 px-3 py-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Note from {from?.name}</div>
            <p className="mt-0.5 text-zinc-800">{h.summary}</p>
          </div>
        </>
      ),
    },
    {
      key: 'context', title: `Context and decisions (${ns.length + ds.length})`,
      body: (
        <ul className="space-y-1">
          {ns.map((n) => <li key={n.id}><b className="font-medium">{n.title}:</b> <span className="text-zinc-700">{n.body}</span></li>)}
          {ds.map((d) => <li key={d.id}><span className="mr-1 font-mono text-[11px] text-zinc-500">DECISION</span><b className="font-medium">{d.title}</b> <span className="text-zinc-600">— {d.rationale}</span></li>)}
        </ul>
      ),
    },
    {
      key: 'documents', title: `Documents (${fs.length})`,
      body: <ul className="space-y-1">{fs.map((f) => <li key={f.id} className="flex items-center gap-2"><DocType kind={f.kind} />{f.name}<span className="font-mono text-[11px] text-zinc-500">{formatBytes(f.size)}</span></li>)}</ul>,
    },
    {
      key: 'actions', title: `Open actions (${ts.length})`,
      body: (
        <table className="w-full"><tbody className="divide-y divide-zinc-100">
          {ts.map((t) => <tr key={t.id}><td className="py-1.5">{t.title}</td><td className="py-1.5"><Person user={emp(t.ownerId)} size="xs" /></td><td className="py-1.5 text-right"><DueLabel task={t} /></td></tr>)}
        </tbody></table>
      ),
    },
    {
      key: 'questions', title: `Questions (${qs.length})`,
      body: <p className="text-zinc-700">{openQs.length ? `${openQs.length} question(s) still open — see the clarification panel.` : 'All questions are answered.'}</p>,
    },
  ]

  return (
    <>
      <PageHeader
        crumb={<><Link to={`/cases/${c.id}`} className="font-mono hover:underline">{c.code}</Link> / Handoff review</>}
        title={c.title}
        sub={<>Submitted {ago(h.createdAt)} · {fmtDateTime(h.createdAt)}</>}
      />

      <Panel className="mb-4">
        <div className="grid items-center gap-4 p-4 md:grid-cols-[1fr_auto_1fr_1.5fr]">
          <div><div className="mb-1 text-[11px] uppercase tracking-wide text-zinc-500">From (current owner)</div><Person user={from} sub={from?.department} size="md" /></div>
          <ArrowRight className="hidden size-5 text-zinc-400 md:block" />
          <div><div className="mb-1 text-[11px] uppercase tracking-wide text-zinc-500">To (incoming owner)</div><Person user={to} sub={to?.department} size="md" /></div>
          <div className="border-zinc-200 md:border-l md:pl-4">
            <div className="text-[11px] uppercase tracking-wide text-zinc-500">Reason</div>
            <div className="text-[13px] font-medium">{reasonLabel[h.reason]}</div>
            <div className="text-xs text-zinc-600">{h.reasonNote}</div>
          </div>
        </div>
        {h.status !== 'submitted' && (
          <div className={cn('border-t px-4 py-2 text-[13px]', h.status === 'accepted' ? 'border-green-200 bg-green-50 text-green-900' : 'border-red-200 bg-red-50 text-red-900')}>
            <b>{h.status === 'accepted' ? `Accepted — ${to?.name} owns this case.` : 'Rejected.'}</b>
            {h.rejectReason && <> Reason: {h.rejectReason}</>}
            {h.decidedAt && <span className="ml-1 font-mono text-xs opacity-70">{fmtDateTime(h.decidedAt)}</span>}
          </div>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Panel>
          <PanelHeader
            title="Sections to acknowledge"
            sub="The receiver confirms each part separately — this is what makes them accountable"
            action={<span className="font-mono text-xs">{ackCount}/5</span>}
          />
          <div className="divide-y divide-zinc-200">
            {sections.map(({ key, title, body }, i) => {
              const acked = h.acks[key]
              return (
                <div key={key} className={cn(acked && 'bg-green-50/40')}>
                  <div className="flex items-center gap-3 px-4 pt-3">
                    <span className="font-mono text-[11px] text-zinc-400">{String(i + 1).padStart(2, '0')}</span>
                    <span className="flex-1 text-[13px] font-semibold">{title}</span>
                    <label className={cn('flex items-center gap-1.5 rounded border px-2 py-1 text-xs', canAct ? 'cursor-pointer' : 'cursor-not-allowed opacity-70', acked ? 'border-green-600 text-green-800' : 'border-zinc-300')}>
                      <input type="checkbox" disabled={!canAct} checked={acked} onChange={(e) => run(() => api.setAck(h.id, { section: key, value: e.target.checked }))} className="accent-green-700" />
                      {acked ? 'Acknowledged' : 'I have read and understood this'}
                    </label>
                  </div>
                  <div className="px-4 pb-3 pl-11 pt-2 text-[13px]">{body}</div>
                </div>
              )
            })}
          </div>
        </Panel>

        <div className="space-y-4 lg:sticky lg:top-16 lg:self-start">
          {canAct && (
            <Panel>
              <PanelHeader
                title="Handoff briefing"
                sub="What you are taking on, and what to ask before accepting"
                action={
                  <Button size="sm" variant="secondary" disabled={briefing.pending} onClick={async () => {
                    const res = await briefing.run(() => api.aiHandoffBrief(h.id))
                    if (res) setBrief(res)
                  }}>
                    <Sparkles className="size-3.5" />{briefing.pending ? 'Reading…' : brief ? 'Refresh' : 'Brief me'}
                  </Button>
                }
              />
              {brief && (
                <div className="space-y-3 p-4">
                  <AiSource result={brief} />
                  <p className="text-[13px] leading-relaxed text-zinc-800">{brief.text}</p>
                  <AiInsights result={brief} gapsTitle={`Ask ${from?.name.split(' ')[0] ?? 'the sender'}`} />
                </div>
              )}
            </Panel>
          )}
          <Panel>
            <PanelHeader title="Clarification" sub="Questions between receiver and sender" />
            <ul className="max-h-80 divide-y divide-zinc-100 overflow-y-auto">
              {qs.map((x) => (
                <li key={x.id} className="px-4 py-2.5 text-[13px]">
                  <div className="text-[11px] text-zinc-500">{emp(x.by)?.name} · {ago(x.at)}</div>
                  <p>{x.text}</p>
                  {x.answer ? (
                    <p className="mt-1 border-l-2 border-green-600 pl-2 text-zinc-700"><b className="font-medium">{emp(x.answeredBy)?.name}:</b> {x.answer}</p>
                  ) : isSender ? (
                    <form className="mt-1.5 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (answer[x.id]?.trim()) run(() => api.answerQuestion(x.id, answer[x.id].trim())) }}>
                      <input className={cn(inputClass, 'py-1')} placeholder="Answer…" value={answer[x.id] ?? ''} onChange={(e) => setAnswer({ ...answer, [x.id]: e.target.value })} />
                      <Button type="submit" size="sm" disabled={!answer[x.id]?.trim()}>Send</Button>
                    </form>
                  ) : <Label tone="amber" className="mt-1">Awaiting {from?.name.split(' ')[0]}</Label>}
                </li>
              ))}
              {qs.length === 0 && <li><Empty title="No questions" /></li>}
            </ul>
            {canAct && (
              <form className="flex gap-2 border-t border-zinc-200 p-3" onSubmit={(e) => { e.preventDefault(); if (q.trim()) run(() => api.askQuestion(c.id, q.trim(), h.id)).then(() => setQ('')) }}>
                <input className={inputClass} placeholder={`Ask ${from?.name.split(' ')[0]}…`} value={q} onChange={(e) => setQ(e.target.value)} />
                <Button type="submit" variant="secondary" disabled={!q.trim()}>Ask</Button>
              </form>
            )}
          </Panel>

          {canAct ? (
            <Panel>
              <PanelHeader title="Decision" />
              <div className="space-y-2 p-3">
                <Button className="w-full" disabled={!canAccept || pending}
                  onClick={async () => {
                    const ok = await run(() => api.acceptHandoff(h.id).then(() => true), { tone: 'success', title: `You now own ${c.code}`, body: 'The transfer is recorded in the ownership chain.' })
                    if (ok) navigate(`/cases/${c.id}?tab=history`)
                  }}>
                  Accept ownership
                </Button>
                {!canAccept && (
                  <p className="text-center text-xs text-zinc-500">
                    {!allAcked ? `Acknowledge all sections first (${5 - ackCount} left)` : `${openQs.length} open question(s) must be answered first`}
                  </p>
                )}
                <Button variant="danger" className="w-full" onClick={() => setRejectOpen(true)}>Reject and send back</Button>
              </div>
            </Panel>
          ) : h.status === 'submitted' && (
            <Panel className="p-3 text-[13px] text-zinc-600">
              {isSender ? <>Waiting for <b>{to?.name}</b> to acknowledge and decide. You can answer their questions here.</> : <>Only <b>{to?.name}</b> can acknowledge and accept.</>}
            </Panel>
          )}
        </div>
      </div>

      <Modal open={rejectOpen} onClose={() => setRejectOpen(false)} title="Reject this forward"
        footer={<>
          <Button variant="secondary" onClick={() => setRejectOpen(false)}>Cancel</Button>
          <Button variant="danger" disabled={reason.trim().length < 10 || pending} onClick={async () => {
            const ok = await run(() => api.rejectHandoff(h.id, reason.trim()).then(() => true), { tone: 'info', title: 'Forward rejected', body: `${from?.name} has been notified. The case stays with them.` })
            setRejectOpen(false)
            if (ok) navigate('/dashboard')
          }}>Reject</Button>
        </>}>
        <Field label="What is missing or wrong?" hint="min. 10 characters, sent to the sender">
          <textarea className={inputClass} rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. No contact at the carrier; remediation plan draft is out of date." />
        </Field>
      </Modal>
    </>
  )
}
