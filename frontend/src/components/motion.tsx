import { useEffect, useRef, useState, type ReactNode } from 'react'
import { animate, motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion'
import { cn } from '../lib/utils'

/** True when the browser can render the 3D scene (WebGL available). */
export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

/**
 * A card that leans toward the cursor in 3D, with a soft light sheen following it.
 * Flat for people who prefer reduced motion.
 */
export function TiltCard({ children, className, max = 4 }: { children: ReactNode; className?: string; max?: number }) {
  const reduce = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const px = useMotionValue(0.5)
  const py = useMotionValue(0.5)
  const spring = { stiffness: 220, damping: 18, mass: 0.6 }
  const rotateX = useSpring(useTransform(py, [0, 1], [max, -max]), spring)
  const rotateY = useSpring(useTransform(px, [0, 1], [-max, max]), spring)
  const sheenX = useTransform(px, (v) => `${v * 100}%`)
  const sheenY = useTransform(py, (v) => `${v * 100}%`)
  const sheen = useMotionTemplate`radial-gradient(220px circle at ${sheenX} ${sheenY}, rgb(255 255 255 / 0.55), transparent 65%)`

  if (reduce) return <div className={className}>{children}</div>

  return (
    <motion.div
      ref={ref}
      className={cn('group relative [transform-style:preserve-3d]', className)}
      style={{ rotateX, rotateY, transformPerspective: 900 }}
      whileHover={{ y: -2, boxShadow: '0 14px 32px -14px rgb(34 35 37 / 0.30)' }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      onPointerMove={(e) => {
        const r = ref.current!.getBoundingClientRect()
        px.set((e.clientX - r.left) / r.width)
        py.set((e.clientY - r.top) / r.height)
      }}
      onPointerLeave={() => { px.set(0.5); py.set(0.5) }}
    >
      <div className="[transform:translateZ(18px)]">{children}</div>
      <motion.div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 [.group:hover_&]:opacity-100" style={{ background: sheen }} />
    </motion.div>
  )
}

/** Counts up to `value` when it first appears or changes. */
export function CountUp({ value, decimals = 0, className }: { value: number; decimals?: number; className?: string }) {
  const reduce = useReducedMotion()
  const [shown, setShown] = useState(reduce ? value : 0)
  const from = useRef(0)
  useEffect(() => {
    if (reduce) { setShown(value); return }
    const controls = animate(from.current, value, {
      duration: 0.6, ease: [0.25, 0.8, 0.25, 1],
      onUpdate: (v) => setShown(v),
    })
    from.current = value
    return () => controls.stop()
  }, [value, reduce])
  return <span className={cn('tabular-nums', className)}>{shown.toFixed(decimals)}</span>
}
