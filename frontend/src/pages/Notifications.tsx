import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMe, useStore } from '../store/useStore'
import { api } from '../api'
import { Button, Empty, Label, PageHeader, Panel, Tabs } from '../components/ui'
import { cn, fmtDateTime } from '../lib/utils'
import type { NotificationKind } from '../lib/types'

const kindLabel: Record<NotificationKind, [string, 'neutral' | 'green' | 'amber' | 'red' | 'blue']> = {
  handoff: ['FORWARD', 'blue'],
  question: ['QUESTION', 'neutral'],
  answer: ['ANSWER', 'neutral'],
  overdue: ['OVERDUE', 'red'],
  accepted: ['ACCEPTED', 'green'],
  rejected: ['REJECTED', 'red'],
  force: ['REASSIGNED', 'amber'],
  assigned: ['ASSIGNED', 'blue'],
}

export default function Notifications() {
  const me = useMe()!
  const navigate = useNavigate()
  const all = useStore((s) => s.notifications)
  const [filter, setFilter] = useState<'all' | 'unread' | 'overdue'>('all')
  const mine = all.filter((n) => n.userId === me.id).sort((a, b) => b.at.localeCompare(a.at))
  const shown = mine.filter((n) => filter === 'all' || (filter === 'unread' ? !n.read : n.kind === 'overdue'))

  return (
    <>
      <PageHeader title="Notifications" sub="Forwards, questions, assignments and deadline alerts for you" actions={<Button variant="secondary" onClick={() => void api.markAllRead()}>Mark all as read</Button>} />
      <Panel>
        <div className="px-2">
          <Tabs value={filter} onChange={setFilter} items={[
            { key: 'all', label: 'All', count: mine.length },
            { key: 'unread', label: 'Unread', count: mine.filter((n) => !n.read).length },
            { key: 'overdue', label: 'Overdue alerts', count: mine.filter((n) => n.kind === 'overdue').length },
          ]} />
        </div>
        {shown.length === 0 ? <Empty title="Nothing here" /> : (
          <ul className="divide-y divide-zinc-100">
            {shown.map((n) => {
              const [label, tone] = kindLabel[n.kind]
              return (
                <li key={n.id}>
                  <button onClick={() => { void api.markRead(n.id); navigate(n.link) }} className={cn('flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-zinc-50', !n.read && 'bg-blue-50/40')}>
                    <span className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-blue-600')} />
                    <span className="w-24 shrink-0 pt-px"><Label tone={tone}>{label}</Label></span>
                    <span className="min-w-0 flex-1">
                      <span className={cn('block text-[13px]', !n.read && 'font-semibold')}>{n.title}</span>
                      <span className="block truncate text-xs text-zinc-600">{n.body}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-zinc-500">{fmtDateTime(n.at)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>
    </>
  )
}
