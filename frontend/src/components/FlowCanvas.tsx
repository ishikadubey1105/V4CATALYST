import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Maximize2, Minus, Plus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../lib/utils'

/**
 * n8n-style node canvas: absolutely positioned nodes, bezier connectors with labels,
 * dotted grid, drag-to-pan and zoom. Purely presentational — callers compute the graph.
 */

export type NodeTone = 'trigger' | 'stage' | 'gate' | 'action' | 'end' | 'alert' | 'overdue' | 'soon' | 'ok' | 'done' | 'none'
export type Side = 'l' | 'r' | 't' | 'b'

export interface FlowNode {
  id: string
  x: number
  y: number
  w?: number
  h?: number
  title: string
  sub?: string
  icon?: LucideIcon
  tone: NodeTone
  badge?: string | number
  /** small status line at the bottom, e.g. "3 blocked" */
  status?: { text: string; tone: 'red' | 'amber' | 'green' | 'neutral' }
  dim?: boolean
}

export interface FlowEdge {
  from: string
  to: string
  fromSide?: Side
  toSide?: Side
  label?: string
  tone?: 'default' | 'pass' | 'fail' | 'muted'
  dashed?: boolean
}

const W = 210
const H = 64

const toneStyle: Record<NodeTone, { icon: string; border: string }> = {
  trigger: { icon: 'bg-zinc-800 text-white', border: 'border-zinc-400' },
  stage: { icon: 'bg-zinc-600 text-white', border: 'border-zinc-300' },
  gate: { icon: 'bg-amber-600 text-white', border: 'border-amber-300' },
  action: { icon: 'bg-zinc-500 text-white', border: 'border-zinc-300' },
  end: { icon: 'bg-green-700 text-white', border: 'border-green-300' },
  alert: { icon: 'bg-red-700 text-white', border: 'border-red-300' },
  overdue: { icon: 'bg-red-600 text-white', border: 'border-red-400' },
  soon: { icon: 'bg-amber-500 text-white', border: 'border-amber-400' },
  ok: { icon: 'bg-zinc-600 text-white', border: 'border-zinc-300' },
  done: { icon: 'bg-green-600 text-white', border: 'border-green-300' },
  none: { icon: 'bg-zinc-300 text-zinc-700', border: 'border-dashed border-zinc-400' },
}

const edgeColor = { default: '#95979a', pass: '#15803d', fail: '#b91c1c', muted: '#b9bbbd' }

function anchor(n: FlowNode, side: Side) {
  const w = n.w ?? W
  const h = n.h ?? H
  switch (side) {
    case 'l': return { x: n.x, y: n.y + h / 2, nx: -1, ny: 0 }
    case 'r': return { x: n.x + w, y: n.y + h / 2, nx: 1, ny: 0 }
    case 't': return { x: n.x + w / 2, y: n.y, nx: 0, ny: -1 }
    case 'b': return { x: n.x + w / 2, y: n.y + h, nx: 0, ny: 1 }
  }
}

export function FlowCanvas({
  nodes, edges, selected, onSelect, height = 520, underlay, minZoom = 0.4, minWidth = 0, minHeight = 0, autoFit = false, scrollToX,
}: {
  nodes: FlowNode[]
  edges: FlowEdge[]
  selected?: string | null
  onSelect?: (id: string | null) => void
  height?: number
  underlay?: ReactNode
  minZoom?: number
  minWidth?: number
  minHeight?: number
  /** fit the whole graph into view on first render */
  autoFit?: boolean
  /** canvas x-coordinate to bring into view on first render (e.g. today on a timeline) */
  scrollToX?: number
}) {
  const [zoom, setZoom] = useState(1)
  const scroller = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; l: number; t: number; moved: boolean } | null>(null)
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]))
  const width = Math.max(minWidth, ...nodes.map((n) => n.x + (n.w ?? W) + 80))
  const contentH = Math.max(minHeight, ...nodes.map((n) => n.y + (n.h ?? H) + 80))

  const fit = () => {
    const el = scroller.current
    if (!el) return
    setZoom(Math.max(minZoom, Math.min(1, el.clientWidth / width, el.clientHeight / contentH)))
  }

  useEffect(() => {
    if (autoFit) fit()
    else if (scrollToX !== undefined && scroller.current) scroller.current.scrollLeft = Math.max(0, scrollToX - scroller.current.clientWidth / 3)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative overflow-hidden rounded-md border border-zinc-300">
      <div
        ref={scroller}
        className="flow-grid cursor-grab overflow-auto active:cursor-grabbing"
        style={{ height }}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('[data-node]')) return
          const el = scroller.current!
          drag.current = { x: e.clientX, y: e.clientY, l: el.scrollLeft, t: el.scrollTop, moved: false }
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d) return
          const el = scroller.current!
          el.scrollLeft = d.l - (e.clientX - d.x)
          el.scrollTop = d.t - (e.clientY - d.y)
          if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 4) d.moved = true
        }}
        onPointerUp={() => {
          if (drag.current && !drag.current.moved) onSelect?.(null)
          drag.current = null
        }}
        onPointerLeave={() => { drag.current = null }}
      >
        <div style={{ width: width * zoom, height: contentH * zoom }}>
          <div className="relative origin-top-left" style={{ width, height: contentH, transform: `scale(${zoom})` }}>
            {underlay}

            <svg className="pointer-events-none absolute inset-0" width={width} height={contentH}>
              <defs>
                {Object.entries(edgeColor).map(([k, c]) => (
                  <marker key={k} id={`arrow-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M0,0 L10,5 L0,10 z" fill={c} />
                  </marker>
                ))}
              </defs>
              {edges.map((e, i) => {
                const a = byId[e.from]
                const b = byId[e.to]
                if (!a || !b) return null
                const p0 = anchor(a, e.fromSide ?? 'r')
                const p1 = anchor(b, e.toSide ?? 'l')
                const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y)
                const k = Math.min(Math.max(50, dist * 0.45), 170)
                const c0 = { x: p0.x + p0.nx * k, y: p0.y + p0.ny * k }
                const c1 = { x: p1.x + p1.nx * k, y: p1.y + p1.ny * k }
                const tone = e.tone ?? 'default'
                const mid = { x: (p0.x + 3 * c0.x + 3 * c1.x + p1.x) / 8, y: (p0.y + 3 * c0.y + 3 * c1.y + p1.y) / 8 }
                const active = selected && (selected === e.from || selected === e.to)
                return (
                  <g key={i}>
                    <path
                      d={`M${p0.x},${p0.y} C${c0.x},${c0.y} ${c1.x},${c1.y} ${p1.x},${p1.y}`}
                      fill="none" stroke={edgeColor[tone]} strokeWidth={active ? 2.5 : 1.6}
                      strokeDasharray={e.dashed ? '5 5' : undefined} markerEnd={`url(#arrow-${tone})`}
                      opacity={selected && !active ? 0.35 : 1}
                    />
                    {e.label && (
                      <g transform={`translate(${mid.x},${mid.y})`}>
                        <rect x={-(e.label.length * 3.2 + 8)} y={-9} width={e.label.length * 6.4 + 16} height={18} rx={3} fill="#fff" stroke={edgeColor[tone]} strokeWidth={1} />
                        <text textAnchor="middle" y={4} fontSize={10.5} fontFamily="IBM Plex Mono, monospace" fill={tone === 'default' || tone === 'muted' ? '#55575a' : edgeColor[tone]}>{e.label}</text>
                      </g>
                    )}
                  </g>
                )
              })}
            </svg>

            {nodes.map((n) => {
              const st = toneStyle[n.tone]
              const Icon = n.icon
              const isSel = selected === n.id
              return (
                <button
                  key={n.id}
                  data-node
                  type="button"
                  onClick={() => onSelect?.(isSel ? null : n.id)}
                  className={cn(
                    'absolute flex overflow-hidden rounded-md border-2 bg-white text-left shadow-sm transition-shadow hover:shadow-md',
                    st.border, isSel && 'border-zinc-900 shadow-lg ring-2 ring-zinc-900/20', n.dim && 'opacity-50',
                  )}
                  style={{ left: n.x, top: n.y, width: n.w ?? W, height: n.h ?? H }}
                >
                  {Icon && <span className={cn('grid w-11 shrink-0 place-items-center', st.icon)}><Icon className="size-5" strokeWidth={1.75} /></span>}
                  <span className="flex min-w-0 flex-1 flex-col justify-center px-2.5 py-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[12.5px] font-semibold text-zinc-900">{n.title}</span>
                      {n.badge !== undefined && <span className="ml-auto shrink-0 rounded-sm bg-zinc-800 px-1.5 font-mono text-[10.5px] font-semibold text-white">{n.badge}</span>}
                    </span>
                    {n.sub && <span className="truncate text-[11px] text-zinc-500">{n.sub}</span>}
                    {n.status && (
                      <span className={cn('truncate font-mono text-[10px]', { red: 'text-red-700', amber: 'text-amber-700', green: 'text-green-700', neutral: 'text-zinc-500' }[n.status.tone])}>
                        ● {n.status.text}
                      </span>
                    )}
                  </span>
                  {/* connector ports */}
                  <span className="absolute -left-[5px] top-1/2 size-2 -translate-y-1/2 rounded-full border border-zinc-400 bg-white" />
                  <span className="absolute -right-[5px] top-1/2 size-2 -translate-y-1/2 rounded-full border border-zinc-400 bg-white" />
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="absolute bottom-3 left-3 flex overflow-hidden rounded border border-zinc-300 bg-white shadow-sm">
        <button onClick={() => setZoom((z) => Math.min(1.5, +(z + 0.1).toFixed(2)))} className="p-1.5 hover:bg-zinc-100" title="Zoom in"><Plus className="size-3.5" /></button>
        <button onClick={() => setZoom((z) => Math.max(minZoom, +(z - 0.1).toFixed(2)))} className="border-l border-zinc-300 p-1.5 hover:bg-zinc-100" title="Zoom out"><Minus className="size-3.5" /></button>
        <button onClick={fit} className="border-l border-zinc-300 p-1.5 hover:bg-zinc-100" title="Fit to view"><Maximize2 className="size-3.5" /></button>
        <span className="border-l border-zinc-300 px-2 py-1 font-mono text-[11px] text-zinc-600">{Math.round(zoom * 100)}%</span>
      </div>
    </div>
  )
}
