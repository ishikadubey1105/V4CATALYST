import { useEffect, useRef, useState } from 'react'
import { cn } from '../lib/utils'

/*
 * Small hand-built charts for the reports page. Series colours are olive / caramel brown, validated as a pair
 * (lightness, chroma, colour-blind separation, contrast) on the white panel surface; text uses ink colours only.
 */
export const SERIES = { blue: '#55701a', orange: '#c08040' }

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(600)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.floor(e.contentRect.width))))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

/** Round the axis maximum up to a friendly number so gridlines land on whole values. */
function niceMax(v: number) {
  if (v <= 4) return 4
  const step = 10 ** Math.floor(Math.log10(v))
  return Math.ceil(v / (step / 2)) * (step / 2)
}

/** Bar with 4px rounded data-end, square on the baseline. */
function barPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h)
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`
}

export interface Series<K extends string> { key: K; label: string; color: string }

/** Grouped columns: one group per bucket, one bar per series. Hover a group for exact values. */
export function GroupedColumns<K extends string, R extends { label: string } & Record<K, number>>({
  rows, series, height = 220, labelEvery = 1, ariaLabel,
}: { rows: R[]; series: Series<K>[]; height?: number; labelEvery?: number; ariaLabel: string }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const m = { top: 8, right: 8, bottom: 22, left: 30 }
  const innerW = width - m.left - m.right
  const innerH = height - m.top - m.bottom
  const max = niceMax(Math.max(1, ...rows.flatMap((r) => series.map((s) => r[s.key]))))
  const groupW = innerW / Math.max(1, rows.length)
  const barW = Math.max(2, Math.min(16, (groupW - 6 - 2 * (series.length - 1)) / series.length))
  const y = (v: number) => m.top + innerH - (v / max) * innerH
  const ticks = [0, max / 2, max]

  return (
    <div ref={ref} className="relative">
      <svg width={width} height={height} role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} stroke="#ebe5dc" strokeWidth={1} />
            <text x={m.left - 6} y={y(t) + 3} textAnchor="end" className="fill-zinc-500 font-mono text-[10px]">{t}</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const gx = m.left + i * groupW
          const start = gx + (groupW - (barW * series.length + 2 * (series.length - 1))) / 2
          return (
            <g key={r.label}>
              {hover === i && <rect x={gx} y={m.top} width={groupW} height={innerH} rx={6} fill="#f5f2ed" />}
              {series.map((s, j) => {
                const v = r[s.key]
                if (!v) return null
                return <path key={s.key} d={barPath(start + j * (barW + 2), y(v), barW, m.top + innerH - y(v))} fill={s.color} />
              })}
              {(i % labelEvery === 0 || rows.length <= 12) && (
                <text x={gx + groupW / 2} y={height - 6} textAnchor="middle" className="fill-zinc-500 font-mono text-[10px]">{r.label}</text>
              )}
              {/* hit target: the whole column, bigger than the bars */}
              <rect x={gx} y={m.top} width={groupW} height={innerH} fill="transparent" onMouseEnter={() => setHover(i)} />
            </g>
          )
        })}
        <line x1={m.left} x2={width - m.right} y1={y(0)} y2={y(0)} stroke="#b3a593" strokeWidth={1} />
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute top-0 z-10 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-md"
          style={{ left: Math.min(width - 150, Math.max(0, m.left + hover * groupW + groupW / 2 - 70)) }}>
          <div className="mb-0.5 font-medium text-zinc-900">{rows[hover].label}</div>
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-2 text-zinc-700">
              <span className="size-2 rounded-sm" style={{ background: s.color }} />{s.label}
              <span className="ml-auto pl-3 font-mono text-zinc-900">{rows[hover][s.key]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function Legend<K extends string>({ series }: { series: Series<K>[] }) {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-zinc-700">
      {series.map((s) => <span key={s.key} className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</span>)}
    </div>
  )
}

/** Ranked horizontal bars (single series, so one hue), values labelled directly. */
export function BarList({ items, color = SERIES.blue, format = (k: string) => k }: { items: { key: string; count: number }[]; color?: string; format?: (k: string) => string }) {
  const max = Math.max(1, ...items.map((i) => i.count))
  if (!items.length) return <p className="text-[13px] text-zinc-500">No complaints in this period.</p>
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={i.key} className="grid grid-cols-[7rem_1fr_2rem] items-center gap-2 text-[13px]" title={`${format(i.key)}: ${i.count}`}>
          <span className="truncate text-zinc-700">{format(i.key)}</span>
          <span className="h-2.5 rounded-full" style={{ width: `${(i.count / max) * 100}%`, background: color, minWidth: 6 }} />
          <span className={cn('text-right font-mono text-zinc-900')}>{i.count}</span>
        </li>
      ))}
    </ul>
  )
}
