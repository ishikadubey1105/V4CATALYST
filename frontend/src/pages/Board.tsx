import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMe, useStore } from '../store/useStore'
import { api, useAction } from '../api'
import { useEmployee, useVisibleCases } from '../lib/hooks'
import { canEditCase, stageMoveBlocked, stages } from '../lib/permissions'
import { Avatar, Label, PageHeader, PriorityLabel, RoleLabel } from '../components/ui'
import { cn, dueState } from '../lib/utils'
import type { Stage } from '../lib/types'

/** Kanban view of the complaint pipeline. Owners/admins can drag a case to another stage; blocked moves explain why. */
export default function Board() {
  const me = useMe()!
  const visible = useVisibleCases()
  const { tasks, toast } = useStore()
  const { run } = useAction()
  const emp = useEmployee()
  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<Stage | null>(null)

  const drop = (to: Stage) => {
    setOver(null)
    const c = visible.find((x) => x.id === dragId)
    setDragId(null)
    if (!c || c.stage === to) return
    if (!canEditCase(me, c)) return toast({ tone: 'warning', title: 'Not allowed', body: 'Only the case owner or an admin can move a case.' })
    const blocked = stageMoveBlocked(c, to, tasks)
    if (blocked) return toast({ tone: 'warning', title: `${c.code} cannot move`, body: blocked })
    run(() => api.moveStage(c.id, to), { tone: 'success', title: `${c.code} moved to ${stages.find((s) => s.key === to)?.label}` })
  }

  return (
    <>
      <PageHeader title="Pipeline board" sub="Drag a case card to change its stage. Stage 4 (Handoff) is controlled by the forwarding workflow." />
      <div className="grid grid-cols-[repeat(5,minmax(230px,1fr))] gap-3 overflow-x-auto pb-4">
        {stages.map((st, i) => {
          const col = visible.filter((c) => c.stage === st.key)
          return (
            <div
              key={st.key}
              onDragOver={(e) => { e.preventDefault(); setOver(st.key) }}
              onDragLeave={() => setOver(null)}
              onDrop={() => drop(st.key)}
              className={cn('min-h-80 rounded-md border bg-zinc-100/60', over === st.key ? 'border-blue-500 bg-blue-50' : 'border-zinc-200')}
            >
              <div className="flex items-center gap-2 border-b border-zinc-200 px-3 py-2">
                <span className="font-mono text-[11px] text-zinc-500">{String(i + 1).padStart(2, '0')}</span>
                <span className="text-[13px] font-semibold">{st.label}</span>
                <span className="ml-auto font-mono text-xs text-zinc-500">{col.length}</span>
              </div>
              <div className="space-y-2 p-2">
                {col.map((c) => {
                  const open = tasks.filter((t) => t.caseId === c.id && !t.done)
                  const overdue = open.filter((t) => dueState(t) === 'overdue').length
                  const draggable = canEditCase(me, c)
                  return (
                    <Link
                      key={c.id}
                      to={`/cases/${c.id}`}
                      draggable={draggable}
                      onDragStart={() => setDragId(c.id)}
                      className={cn('block rounded border border-zinc-200 bg-white p-2.5 hover:border-zinc-400', draggable && 'cursor-grab active:cursor-grabbing', dragId === c.id && 'opacity-50')}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[11px] text-zinc-500">{c.code}</span>
                        {c.role !== "admin" && c.role !== "auditor" && <RoleLabel role={c.role} />}
                      </div>
                      <div className="mt-1 line-clamp-2 text-[13px] font-medium leading-snug">{c.title}</div>
                      <div className="mt-2 flex items-center justify-between">
                        <PriorityLabel priority={c.priority} />
                        <div className="flex items-center gap-1.5">
                          {overdue > 0 && <Label tone="red">{overdue} overdue</Label>}
                          <span className="font-mono text-[11px] text-zinc-500">{open.length} open</span>
                          <Avatar user={emp(c.ownerId)} size="xs" />
                        </div>
                      </div>
                    </Link>
                  )
                })}
                {col.length === 0 && <div className="py-6 text-center text-xs text-zinc-400">No cases</div>}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
