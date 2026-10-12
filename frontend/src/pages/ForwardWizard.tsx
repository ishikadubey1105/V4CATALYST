import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Check, Search, X } from 'lucide-react'
import { useMe, useStore } from '../store/useStore'
import { api, useAction } from '../api'
import { Button, ButtonLink, Empty, Field, Meter, PageHeader, Panel, PanelHeader, Person, inputClass, tdClass, thClass } from '../components/ui'
import { runCompleteness } from '../lib/completeness'
import { canForward } from '../lib/permissions'
import { cn, reasonLabel } from '../lib/utils'
import type { Draft, HandoffReason } from '../lib/types'

const steps = ['Recipient & reason', 'Handoff note', 'Completeness check']

export default function ForwardWizard() {
  const { id } = useParams()
  const me = useMe()!
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const step = Math.min(2, Math.max(0, Number(params.get('step') ?? 0)))
  const s = useStore()
  const [q, setQ] = useState('')
  const { run, pending } = useAction()
  const c = s.cases.find((x) => x.id === id)
  const draft: Draft = (id && s.drafts[id]) || { summary: '', reasonNote: '' }

  if (!c) return <Panel><Empty title="Case not found" /></Panel>
  if (!canForward(me, c)) {
    return (
      <Panel className="mx-auto mt-10 max-w-md p-6">
        <div className="font-mono text-xs text-red-700">FORWARD NOT AVAILABLE</div>
        <p className="mt-2 text-[13px] text-zinc-700">
          {c.stage === 'handoff' ? 'This case is already being forwarded and is waiting for the receiver.'
            : c.stage === 'resolved' ? 'Resolved cases cannot be forwarded.'
              : 'Only the current owner can forward a case. Admins can use "Reassign" on the case page.'}
        </p>
        <ButtonLink to={`/cases/${c.id}`} variant="secondary" className="mt-4">Back to case</ButtonLink>
      </Panel>
    )
  }

  const save = (patch: Partial<Draft>) => s.saveDraft(c.id, patch)
  const go = (n: number) => setParams({ step: String(n) })
  const result = runCompleteness({ caseId: c.id, draft, tasks: s.tasks, decisions: s.decisions, docs: s.docs, questions: s.questions })
  const candidates = s.employees
    .filter((u) => u.id !== c.ownerId && u.active && u.orgRole !== 'auditor')
    .filter((u) => !q || `${u.name} ${u.department} ${u.title}`.toLowerCase().includes(q.toLowerCase()))
  const receiver = s.employees.find((u) => u.id === draft.toId)
  const step0ok = !!draft.toId && !!draft.reason && draft.reasonNote.trim().length >= 10

  const submit = async () => {
    if (!draft.toId || !draft.reason) return
    const body = { toId: draft.toId, reason: draft.reason, reasonNote: draft.reasonNote, summary: draft.summary }
    const hid = await run(() => api.submitHandoff(c.id, body), { tone: 'success', title: `${c.code} forwarded`, body: `${receiver?.name} has been notified and must acknowledge it.` })
    if (hid) navigate(`/handoffs/${hid}`)
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        crumb={<><Link to="/cases" className="hover:underline">Cases</Link> / <Link to={`/cases/${c.id}`} className="font-mono hover:underline">{c.code}</Link> / Forward</>}
        title="Forward case to another employee"
        sub={c.title}
        actions={<Button variant="ghost" onClick={() => { s.discardDraft(c.id); navigate(`/cases/${c.id}`) }}><X className="size-3.5" />Discard draft</Button>}
      />

      <ol className="mb-5 grid grid-cols-3 overflow-hidden rounded-md border border-zinc-200 bg-white">
        {steps.map((label, i) => (
          <li key={label} className={cn('border-r border-zinc-200 last:border-r-0', i === step && 'bg-zinc-900 text-white')}>
            <button onClick={() => go(i)} className="flex w-full items-center gap-2 px-3 py-2 text-left">
              <span className={cn('font-mono text-[11px]', i === step ? 'text-zinc-400' : 'text-zinc-500')}>
                {i < step ? <Check className="size-3 text-green-600" /> : `0${i + 1}`}
              </span>
              <span className="text-[13px] font-medium">{label}</span>
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <Panel>
            <PanelHeader
              title="Recipient"
              sub="Any active employee in the organisation. They become owner only after accepting."
              action={<div className="relative w-48"><Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-zinc-400" /><input className={cn(inputClass, 'py-1 pl-7')} placeholder="Filter" value={q} onChange={(e) => setQ(e.target.value)} /></div>}
            />
            <table className="w-full text-[13px]">
              <thead className="bg-zinc-50"><tr><th className={cn(thClass, 'w-8')} /><th className={thClass}>Employee</th><th className={thClass}>Department</th><th className={thClass}>Owns</th><th className={thClass}>Open tasks</th></tr></thead>
              <tbody className="divide-y divide-zinc-100">
                {candidates.map((u) => {
                  const owns = s.cases.filter((x) => x.ownerId === u.id && x.stage !== 'resolved').length
                  const open = s.tasks.filter((t) => t.ownerId === u.id && !t.done).length
                  return (
                    <tr key={u.id} onClick={() => save({ toId: u.id })} className={cn('cursor-pointer hover:bg-zinc-50', draft.toId === u.id && 'bg-blue-50')}>
                      <td className={tdClass}><input type="radio" readOnly checked={draft.toId === u.id} className="accent-zinc-900" /></td>
                      <td className={tdClass}><Person user={u} sub={u.title} size="xs" /></td>
                      <td className={cn(tdClass, 'text-zinc-600')}>{u.department}</td>
                      <td className={cn(tdClass, 'font-mono text-xs')}>{owns}</td>
                      <td className={cn(tdClass, 'font-mono text-xs', open > 3 && 'text-red-700')}>{open}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {candidates.length === 0 && <Empty title="No matching employees" />}
          </Panel>

          <Panel>
            <PanelHeader title="Reason for forwarding" sub="Recorded in the ownership chain and audit log" />
            <div className="space-y-1 p-3">
              {(Object.keys(reasonLabel) as HandoffReason[]).map((r) => (
                <label key={r} className={cn('flex cursor-pointer items-center gap-2 rounded border px-2.5 py-1.5 text-[13px]', draft.reason === r ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-200 hover:bg-zinc-50')}>
                  <input type="radio" name="reason" checked={draft.reason === r} onChange={() => save({ reason: r })} className="accent-zinc-900" />
                  {reasonLabel[r]}
                </label>
              ))}
              <div className="pt-2">
                <Field label="Explanation" hint="min. 10 characters">
                  <textarea className={inputClass} rows={3} value={draft.reasonNote} onChange={(e) => save({ reasonNote: e.target.value })} placeholder="e.g. On planned leave 14–28 Oct; Ravi already knows the carrier contacts." />
                </Field>
              </div>
            </div>
            <div className="flex justify-end border-t border-zinc-200 p-3">
              <Button disabled={!step0ok} onClick={() => go(1)}>Continue</Button>
            </div>
          </Panel>
        </div>
      )}

      {step === 1 && (
        <Panel>
          <PanelHeader title="Handoff note" sub={`What ${receiver?.name.split(' ')[0] ?? 'the recipient'} must know first: current position, risks, what is urgent`} />
          <div className="p-4">
            <textarea className={cn(inputClass, 'min-h-48 leading-relaxed')} value={draft.summary} onChange={(e) => save({ summary: e.target.value })}
              placeholder="e.g. Carrier has agreed to roll back the routing rule; waiting for written confirmation. Most urgent: send the remediation plan to Nimbus by Friday." />
            <div className="mt-1.5 flex justify-between text-xs">
              <span className={draft.summary.trim().length >= 40 ? 'text-green-700' : 'text-zinc-500'}>{draft.summary.trim().length} / 40 characters minimum</span>
              {/* Appends below what is already written instead of replacing it. */}
              <button
                type="button" disabled={draft.summary.includes(c.summary.trim())}
                className="text-blue-700 hover:underline disabled:text-zinc-400 disabled:no-underline"
                onClick={() => save({ summary: [draft.summary.trim(), c.summary.trim()].filter(Boolean).join('\n\n') })}
              >
                {draft.summary.includes(c.summary.trim()) ? 'Case summary inserted' : 'Insert case summary'}
              </button>
            </div>
          </div>
          <div className="flex justify-between border-t border-zinc-200 p-3">
            <Button variant="secondary" onClick={() => go(0)}>Back</Button>
            <Button onClick={() => go(2)}>Run completeness check</Button>
          </div>
        </Panel>
      )}

      {step === 2 && (
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          <Panel className="h-fit">
            <PanelHeader title="Result" />
            <div className="p-4">
              <Meter passed={result.passed} total={result.total} />
              <div className={cn('mt-4 rounded border px-3 py-2 text-[13px]', result.ok ? 'border-green-300 bg-green-50 text-green-900' : 'border-red-300 bg-red-50 text-red-900')}>
                {result.ok ? 'All checks pass. The case can be forwarded.' : `Forwarding is blocked. Fix the ${result.total - result.passed} failing item(s).`}
              </div>
              <div className="mt-4 space-y-1 text-xs text-zinc-600">
                <div>To: <b className="text-zinc-900">{receiver?.name ?? '—'}</b></div>
                <div>Reason: <b className="text-zinc-900">{draft.reason ? reasonLabel[draft.reason] : '—'}</b></div>
              </div>
            </div>
            <div className="flex gap-2 border-t border-zinc-200 p-3">
              <Button variant="secondary" onClick={() => go(1)}>Back</Button>
              <Button className="flex-1" disabled={!result.ok || pending} onClick={submit}>{pending ? 'Submitting…' : 'Submit forward'}</Button>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Completeness checklist" sub="Each failing item links to the exact place to fix it" />
            <table className="w-full text-[13px]">
              <tbody className="divide-y divide-zinc-100">
                {result.items.map((item, i) => (
                  <tr key={item.id} className={cn(!item.pass && 'bg-red-50/40')}>
                    <td className="w-10 px-4 py-2.5 font-mono text-[11px] text-zinc-400">{String(i + 1).padStart(2, '0')}</td>
                    <td className="w-16 py-2.5">
                      <span className={cn('rounded-sm border px-1.5 py-px font-mono text-[10px] font-semibold', item.pass ? 'border-green-300 text-green-700' : 'border-red-300 text-red-700')}>{item.pass ? 'PASS' : 'FAIL'}</span>
                    </td>
                    <td className="py-2.5">
                      <div className="font-medium">{item.label}</div>
                      <div className={cn('text-xs', item.pass ? 'text-zinc-500' : 'text-red-800')}>{item.detail}</div>
                    </td>
                    <td className="px-4 py-2.5 text-right">{!item.pass && <Link to={item.fix} className="whitespace-nowrap text-xs font-medium text-blue-700 hover:underline">{item.fixLabel} →</Link>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>
      )}
    </div>
  )
}
