import { useEffect, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { AlertTriangle, Check, CheckCircle2, Clock, Info, X } from 'lucide-react'
import { avatarTone, cn, dueState, initials } from '../lib/utils'
import { stages, stageIndex } from '../lib/permissions'
import type { CaseRole, DocKind, Employee, Priority, Stage, Task } from '../lib/types'
import { caseRoleLabel } from '../lib/permissions'
import { useStore } from '../store/useStore'

/* ---------- Buttons ---------- */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link'
type Size = 'sm' | 'md'

const variants: Record<Variant, string> = {
  primary: 'bg-zinc-900 text-white hover:bg-zinc-800 border border-zinc-900 shadow-sm',
  secondary: 'bg-white text-zinc-800 border border-zinc-300/80 shadow-xs hover:bg-zinc-50 hover:border-zinc-300',
  ghost: 'text-zinc-600 hover:bg-zinc-200/60 hover:text-zinc-900 border border-transparent',
  danger: 'bg-white text-red-700 border border-red-200 shadow-xs hover:bg-red-50',
  link: 'text-blue-700 hover:text-blue-800 hover:underline underline-offset-2 border border-transparent px-0',
}
const sizes: Record<Size, string> = { sm: 'h-7 px-2.5 text-xs rounded-md', md: 'h-9 px-3.5 text-[13px] rounded-lg' }

export const buttonClass = (variant: Variant = 'primary', size: Size = 'md', className?: string) =>
  cn(
    'inline-flex items-center justify-center gap-1.5 font-medium whitespace-nowrap transition-[background-color,border-color,color,transform] duration-150 active:translate-y-px',
    'disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500',
    variants[variant], sizes[size], variant === 'link' && 'h-auto px-0', className,
  )

export function Button({ variant, size, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />
}

export function ButtonLink({ variant, size, className, ...props }: LinkProps & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />
}

/* ---------- Surfaces ---------- */

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <section className={cn('overflow-hidden rounded-xl border border-zinc-200/80 bg-white shadow-sm', className)} {...props} />
}

export function PanelHeader({ title, sub, action, className }: { title: ReactNode; sub?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-h-12 items-center justify-between gap-3 border-b border-zinc-100 px-5 py-3', className)}>
      <div className="min-w-0">
        <h2 className="text-[13.5px] font-semibold tracking-[-0.005em] text-zinc-900">{title}</h2>
        {sub && <p className="mt-0.5 text-xs text-zinc-500">{sub}</p>}
      </div>
      {action}
    </div>
  )
}

export function PageHeader({ title, sub, actions, crumb }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; crumb?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {crumb && <div className="mb-1.5 text-xs text-zinc-500 [&_a]:text-zinc-600 [&_a:hover]:text-zinc-900">{crumb}</div>}
        <h1 className="font-display text-[28px] font-medium leading-tight text-zinc-900">{title}</h1>
        {sub && <div className="mt-1 text-[13px] text-zinc-500">{sub}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function KeyValue({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-[13px]">
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-zinc-500">{k}</dt>
          <dd className="min-w-0 text-zinc-900">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

/* ---------- Labels ---------- */

type Tone = 'neutral' | 'green' | 'amber' | 'red' | 'blue'
const tones: Record<Tone, string> = {
  neutral: 'border-zinc-200 bg-zinc-100/70 text-zinc-700',
  green: 'border-emerald-200/80 bg-emerald-50 text-emerald-800',
  amber: 'border-amber-200/80 bg-amber-50 text-amber-800',
  red: 'border-red-200/80 bg-red-50 text-red-700',
  blue: 'border-blue-200/80 bg-blue-50 text-blue-800',
}

export function Label({ tone = 'neutral', className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-px text-[11px] font-medium leading-4', tones[tone], className)}>{children}</span>
}

const stageTone: Record<Stage, Tone> = { received: 'neutral', investigation: 'blue', action: 'amber', handoff: 'red', resolved: 'green' }
export function StageLabel({ stage }: { stage: Stage }) {
  const i = stageIndex(stage)
  return <Label tone={stageTone[stage]}><span className="font-mono">{i + 1}</span>{stages[i].label}</Label>
}

export function PriorityLabel({ priority }: { priority: Priority }) {
  const bars = { high: 3, medium: 2, low: 1 }[priority]
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-zinc-700">
      <span className="flex items-end gap-px">
        {[1, 2, 3].map((b) => <span key={b} className={cn('w-[3px]', b <= bars ? (priority === 'high' ? 'bg-red-600' : 'bg-zinc-700') : 'bg-zinc-300')} style={{ height: 4 + b * 3 }} />)}
      </span>
      {priority[0].toUpperCase() + priority.slice(1)}
    </span>
  )
}

const roleTone: Record<CaseRole, Tone> = { owner: 'blue', receiver: 'red', assignee: 'amber', previous_owner: 'neutral', admin: 'neutral', auditor: 'neutral', none: 'neutral' }
export function RoleLabel({ role }: { role: CaseRole }) {
  return <Label tone={roleTone[role]}>{caseRoleLabel[role]}</Label>
}

export function DueLabel({ task }: { task: Pick<Task, 'due' | 'done'> }) {
  const state = dueState(task)
  if (state === 'done') return <Label tone="green"><Check className="size-3" />Done</Label>
  if (state === 'none') return <Label tone="amber">No deadline</Label>
  const date = new Date(task.due!).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })
  if (state === 'overdue') return <Label tone="red"><AlertTriangle className="size-3" />Overdue {date}</Label>
  if (state === 'soon') return <Label tone="amber"><Clock className="size-3" />Due {date}</Label>
  return <span className="font-mono text-xs text-zinc-600">{date}</span>
}

export function DocType({ kind }: { kind: DocKind }) {
  const label = { pdf: 'PDF', doc: 'DOC', sheet: 'XLS', image: 'IMG', other: 'FILE' }[kind]
  const color = { pdf: 'text-red-700 border-red-200', doc: 'text-blue-700 border-blue-200', sheet: 'text-green-700 border-green-200', image: 'text-zinc-700 border-zinc-300', other: 'text-zinc-500 border-zinc-200' }[kind]
  return <span className={cn('inline-grid h-7 w-9 shrink-0 place-items-center rounded-sm border bg-white font-mono text-[10px] font-semibold', color)}>{label}</span>
}

/* ---------- People ---------- */

export function Avatar({ user, size = 'md' }: { user?: Employee | null; size?: 'xs' | 'sm' | 'md' | 'lg' }) {
  const s = { xs: 'size-5 text-[9px]', sm: 'size-6 text-[10px]', md: 'size-8 text-xs', lg: 'size-11 text-sm' }[size]
  if (!user) return <span className={cn('grid shrink-0 place-items-center rounded-full border border-dashed border-zinc-300 text-zinc-400', s)}>–</span>
  return <span title={user.name} className={cn('grid shrink-0 place-items-center rounded-full font-semibold ring-2 ring-white', avatarTone(user.id), s)}>{initials(user.name)}</span>
}

export function Person({ user, sub, size = 'sm' }: { user?: Employee | null; sub?: ReactNode; size?: 'xs' | 'sm' | 'md' }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <Avatar user={user} size={size} />
      <span className="min-w-0">
        <span className={cn('block truncate text-[13px]', user ? 'text-zinc-900' : 'text-zinc-400 italic')}>{user?.name ?? 'Unassigned'}</span>
        {sub && <span className="block truncate text-[11px] text-zinc-500">{sub}</span>}
      </span>
    </span>
  )
}

/* ---------- Pipeline ---------- */

/**
 * Numbered stage bar. Stages are clickable when `onSelect` is given; blocked moves show the reason as a tooltip.
 */
export function Pipeline({ stage, onSelect, blockedReason }: { stage: Stage; onSelect?: (s: Stage) => void; blockedReason?: (s: Stage) => string | null }) {
  const current = stageIndex(stage)
  return (
    <ol className="grid grid-cols-5 gap-1 rounded-xl border border-zinc-200/80 bg-white p-1 shadow-sm">
      {stages.map((st, i) => {
        const reason = blockedReason?.(st.key) ?? null
        const clickable = !!onSelect && i !== current && !reason
        const state = i < current ? 'done' : i === current ? 'current' : 'todo'
        return (
          <li key={st.key} className={cn('relative rounded-lg', state === 'current' && 'bg-zinc-900 text-white shadow-md', state === 'done' && 'bg-zinc-50')}>
            <button
              type="button"
              disabled={!clickable}
              onClick={() => onSelect?.(st.key)}
              title={reason ?? st.hint}
              className={cn('flex w-full flex-col items-start rounded-lg px-3 py-2 text-left transition-colors', clickable && 'hover:bg-zinc-100', !clickable && 'cursor-default')}
            >
              <span className={cn('flex items-center gap-1.5 font-mono text-[11px]', state === 'current' ? 'text-zinc-300' : 'text-zinc-500')}>
                {state === 'done' ? <Check className="size-3 text-emerald-600" /> : <span>{String(i + 1).padStart(2, '0')}</span>}
                STAGE
              </span>
              <span className={cn('text-[13px] font-semibold', state === 'todo' && 'text-zinc-500')}>{st.label}</span>
              <span className={cn('hidden truncate text-[11px] lg:block', state === 'current' ? 'text-zinc-400' : 'text-zinc-400')}>{st.hint}</span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

/* ---------- Completeness meter ---------- */

export function Meter({ passed, total }: { passed: number; total: number }) {
  const ok = passed === total
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className={cn('font-display text-5xl font-medium tabular-nums', ok ? 'text-emerald-700' : 'text-red-700')}>{Math.round((passed / total) * 100)}%</span>
        <span className="text-[13px] text-zinc-500">{passed} of {total} checks pass</span>
      </div>
      <div className="mt-3 flex gap-1">
        {Array.from({ length: total }).map((_, i) => <span key={i} className={cn('h-2 flex-1 rounded-full transition-colors', i < passed ? (ok ? 'bg-emerald-500' : 'bg-zinc-800') : 'bg-zinc-200')} />)}
      </div>
    </div>
  )
}

/* ---------- Tabs ---------- */

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { key: T; label: string; count?: number }[] }) {
  return (
    <div className="flex gap-0 overflow-x-auto border-b border-zinc-200">
      {items.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={cn('-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors',
            value === t.key ? 'border-blue-700 text-zinc-900' : 'border-transparent text-zinc-500 hover:text-zinc-800')}
        >
          {t.label}
          {t.count !== undefined && <span className={cn('rounded-full px-1.5 font-mono text-[10.5px]', value === t.key ? 'bg-blue-50 text-blue-800' : 'bg-zinc-100 text-zinc-600')}>{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

/* ---------- Overlays ---------- */

export function Modal({ open, onClose, title, children, footer, width = 'max-w-lg' }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; width?: string }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-zinc-950/30 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div className={cn('w-full animate-rise overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl', width)} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pb-2 pt-5">
          <h3 className="font-display text-xl font-medium text-zinc-900">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"><X className="size-4" /></button>
        </div>
        <div className="px-6 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-zinc-100 bg-zinc-50/70 px-6 py-3.5">{footer}</div>}
      </div>
    </div>
  )
}

export function Toaster() {
  const toasts = useStore((s) => s.toasts)
  const dismiss = useStore((s) => s.dismissToast)
  const icon = { info: Info, success: CheckCircle2, danger: AlertTriangle, warning: Clock }
  const color = { info: 'text-blue-600', success: 'text-emerald-600', danger: 'text-red-600', warning: 'text-amber-600' }
  return (
    <div className="fixed bottom-5 right-5 z-[60] flex w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col gap-2" aria-live="polite">
      {toasts.map((t) => {
        const I = icon[t.tone]
        return (
          <div key={t.id} className="flex animate-rise gap-3 rounded-xl border border-zinc-200 bg-white p-3.5 shadow-lg">
            <I className={cn('mt-0.5 size-4 shrink-0', color[t.tone])} />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-zinc-900">{t.title}</div>
              {t.body && <div className="mt-0.5 text-xs text-zinc-600">{t.body}</div>}
            </div>
            <button onClick={() => dismiss(t.id)} className="text-zinc-400 hover:text-zinc-700"><X className="size-3.5" /></button>
          </div>
        )
      })}
    </div>
  )
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="px-4 py-12 text-center">
      <div className="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-zinc-100 text-zinc-400"><Check className="size-4" /></div>
      <div className="text-[13px] font-medium text-zinc-700">{title}</div>
      {body && <p className="mx-auto mt-1 max-w-sm text-xs text-zinc-500">{body}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-zinc-700">{label}{hint && <span className="ml-1 font-normal text-zinc-400">{hint}</span>}</span>
      {children}
    </label>
  )
}

export const inputClass =
  'w-full rounded-lg border border-zinc-300/90 bg-white px-3 py-2 text-[13px] text-zinc-900 shadow-xs transition-[border-color,box-shadow] placeholder:text-zinc-400 hover:border-zinc-400/70 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/15 disabled:bg-zinc-50 disabled:text-zinc-500'

export const thClass = 'px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-[0.06em] text-zinc-500'
export const tdClass = 'px-4 py-2.5 align-middle'

/* ---------- Brand ---------- */

/** The Baton mark: a baton mid-pass along a dotted relay arc. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-8 shrink-0', className)} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#3f4720" />
      <path d="M8.5 21.5c3.2-6.4 8.6-11 15-12.6" fill="none" stroke="#b6c17f" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="0.1 3.2" />
      <rect x="11.2" y="13.8" width="13" height="4.6" rx="2.3" transform="rotate(-38 17.7 16.1)" fill="#c08040" />
      <circle cx="9" cy="22" r="2.2" fill="#fbfaf8" />
    </svg>
  )
}
