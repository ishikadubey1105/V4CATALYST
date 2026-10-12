import { AlertTriangle, CircleHelp, Clock, Cpu } from 'lucide-react'
import type { ReactNode } from 'react'
import type { AiResult } from '../api/contracts'
import { Label } from './ui'

/** Says where the text came from: the server's analysis of this case record (nothing leaves your system). */
export function AiSource(_: { result: AiResult }) {
  return <Label tone="neutral"><Cpu className="size-3" />Generated from the case record</Label>
}

function List({ icon, title, items, tone }: { icon: ReactNode; title: string; items: string[]; tone: string }) {
  if (!items.length) return null
  return (
    <div>
      <div className={`mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide ${tone}`}>{icon}{title}</div>
      <ul className="space-y-1 text-[13px] text-zinc-800">
        {items.map((x, i) => <li key={i} className="flex gap-2"><span className="text-zinc-400">–</span><span>{x}</span></li>)}
      </ul>
    </div>
  )
}

/** Urgent items, risks and gaps/questions from an AI result. */
export function AiInsights({ result, gapsTitle }: { result: AiResult; gapsTitle: string }) {
  const empty = !result.urgent.length && !result.risks.length && !result.gaps.length
  return (
    <div className="space-y-3">
      <List icon={<Clock className="size-3" />} title="Do first" items={result.urgent} tone="text-red-700" />
      <List icon={<AlertTriangle className="size-3" />} title="Risks" items={result.risks} tone="text-amber-700" />
      <List icon={<CircleHelp className="size-3" />} title={gapsTitle} items={result.gaps} tone="text-blue-700" />
      {empty && <p className="text-[13px] text-zinc-500">Nothing urgent, risky or missing was found.</p>}
    </div>
  )
}
