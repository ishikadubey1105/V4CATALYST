import { lazy, Suspense, useState, type FormEvent } from 'react'
import { useReducedMotion } from 'framer-motion'
import { useLocation, useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Check, Eye, EyeOff, Lock, ShieldCheck, User } from 'lucide-react'
import { API_MODE, api } from '../api'
import { BrandMark, inputClass } from '../components/ui'
import { webglAvailable } from '../components/motion'
import { MintLagoonBackground } from '../components/MintLagoonBackground'
import { credentials, employees } from '../data/mock'
import { avatarTone, cn, initials, orgRoleLabel } from '../lib/utils'

/** Demo accounts (the seeded users) for one-click sign-in during demos. Hide with VITE_DEMO_ACCOUNTS=off. */
const SHOW_DEMO = import.meta.env.VITE_DEMO_ACCOUNTS !== 'off'
const demoAccounts = employees.filter((e) => credentials[e.username])

// The 3D scene (three.js) loads in its own chunk, so the sign-in form never waits for it.
const RelayScene = lazy(() => import('../components/RelayScene'))
const canRender3D = typeof window !== 'undefined' && webglAvailable()

const handoverChecks = ['Context & notes', 'Decisions recorded', 'Documents attached', 'Every task owned and dated', 'Questions answered']

/** The illustration on the brand side: one case being handed over, its checks ticking off in turn. */
function HandoverCard() {
  return (
    <div className="relative w-full max-w-[420px] animate-rise rounded-2xl bg-zinc-50 p-5 text-zinc-900 shadow-xl [animation-delay:150ms]">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="font-mono text-[11px] text-zinc-500">CMP-1042</div>
          <div className="truncate text-[13.5px] font-semibold">Late deliveries — Nimbus Retail</div>
        </div>
        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">Forwarding</span>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className={cn('grid size-9 place-items-center rounded-full text-xs font-semibold', avatarTone('e1'))}>AR</span>
          <div className="leading-tight"><div className="text-[12.5px] font-medium">Asha Rao</div><div className="text-[11px] text-zinc-500">On leave Monday</div></div>
        </div>
        <svg viewBox="0 0 120 24" className="h-6 flex-1" aria-hidden="true">
          <path id="relay" d="M2 18 C 40 2, 80 2, 118 18" fill="none" stroke="#b3a593" strokeWidth="1.5" strokeDasharray="0.1 5" strokeLinecap="round" />
          <rect width="16" height="5" rx="2.5" fill="#c08040" style={{ offsetPath: 'path("M2 18 C 40 2, 80 2, 118 18")', offsetRotate: 'auto', animation: 'travel 3.2s cubic-bezier(.6,0,.4,1) infinite alternate' }} />
        </svg>
        <div className="flex items-center gap-2">
          <div className="text-right leading-tight"><div className="text-[12.5px] font-medium">Ravi Menon</div><div className="text-[11px] text-zinc-500">Takes over</div></div>
          <span className={cn('grid size-9 place-items-center rounded-full text-xs font-semibold', avatarTone('e2'))}>RM</span>
        </div>
      </div>

      <ul className="mt-5 space-y-2">
        {handoverChecks.map((label, i) => (
          <li key={label} className="flex items-center gap-2.5 text-[12.5px] text-zinc-700">
            <span className="grid size-[18px] place-items-center rounded-full bg-emerald-500 text-white animate-tick" style={{ animationDelay: `${600 + i * 260}ms` }}>
              <Check className="size-3" strokeWidth={3} />
            </span>
            {label}
          </li>
        ))}
      </ul>

      <div className="mt-5 border-t border-zinc-200 pt-4">
        <div className="mb-1.5 flex justify-between text-[11.5px]"><span className="text-zinc-500">Handover readiness</span><span className="font-medium text-emerald-700">Ready to send</span></div>
        <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200">
          <div className="h-full origin-left rounded-full bg-emerald-500 animate-[grow_1.6s_cubic-bezier(.2,.7,.2,1)_.5s_both]" />
        </div>
      </div>
    </div>
  )
}

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState<{ code: string; message: string } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState(false)
  const reduceMotion = useReducedMotion()

  const signIn = async (u: string, p: string) => {
    setBusy(true)
    setError(null)
    try {
      await api.login(u, p)
      navigate((location.state as { from?: string } | null)?.from ?? '/dashboard', { replace: true })
    } catch (err) {
      const ex = err as { code?: string; message?: string }
      setError({ code: ex.code ?? 'ERROR', message: ex.message ?? 'Sign-in failed.' })
      setAttempt((a) => a + 1)
    } finally {
      setBusy(false)
    }
  }
  const submit = (e: FormEvent) => { e.preventDefault(); void signIn(username, password) }

  const errorTitle = error?.code === 'INVALID_USER' ? 'We don’t recognise that username'
    : error?.code === 'INVALID_PASSWORD' ? 'That password isn’t right'
      : error?.code === 'ACCOUNT_LOCKED' ? 'Account locked'
        : error?.code === 'ACCOUNT_DISABLED' ? 'Account disabled' : 'Couldn’t sign you in'

  return (
    <div className="grid min-h-screen grid-cols-1 bg-paper lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]">
      {/* Brand story */}
      <aside className="grain relative hidden overflow-hidden bg-blue-900 text-zinc-50 lg:flex lg:flex-col">
        <div aria-hidden="true" className="pointer-events-none absolute -right-40 -top-40 size-[520px] rounded-full border border-white/[0.06]" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 size-[360px] rounded-full border border-white/[0.06]" />
        <div className="flex items-center gap-2.5 px-12 pt-10">
          <BrandMark className="size-9 ring-1 ring-white/10 rounded-[10px]" />
          <span className="font-display text-[22px] font-medium tracking-tight">Thread</span>
        </div>

        <div className="relative z-10 px-12 pt-12 xl:px-16">
          <div className="max-w-[520px] animate-rise">
            <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-baton">Complaint handoffs</div>
            <h1 className="font-display text-[44px] font-normal leading-[1.08] xl:text-[52px]">
              No complaint left <em className="font-display italic text-baton-soft">hanging</em>.
            </h1>
            <p className="mt-5 max-w-[440px] text-[15px] leading-relaxed text-blue-100/80">
              Thread keeps every case's story in one piece as it changes hands — context, decisions, deadlines and open
              questions travel together, so the customer never has to explain twice.
            </p>
          </div>
        </div>

        {/* 3D relay: the baton travels from the person handing over to the person receiving */}
        <div className="relative min-h-[340px] flex-1">
          {canRender3D ? (
            <Suspense fallback={null}>
              <div className="absolute inset-0 animate-[fadein_1.2s_ease_.2s_both]"><RelayScene animate={!reduceMotion} /></div>
            </Suspense>
          ) : (
            <div className="flex h-full items-center px-12 xl:px-16"><HandoverCard /></div>
          )}
        </div>

        <div className="relative z-10 grid grid-cols-3 gap-6 border-t border-white/10 px-12 py-6 text-[12px] text-blue-100/70 xl:px-16">
          {[['8-point', 'completeness check before any forward'], ['5 sections', 'acknowledged by the receiver'], ['Every step', 'recorded in an append-only audit trail']].map(([k, v]) => (
            <div key={k}><div className="font-display text-[17px] text-zinc-50">{k}</div><div className="mt-0.5 leading-snug">{v}</div></div>
          ))}
        </div>
      </aside>

      {/* Sign-in */}
      <MintLagoonBackground role="main" className="flex min-w-0 flex-col px-6 py-10 sm:px-10">
        <div className="flex items-center gap-2.5 lg:hidden">
          <BrandMark className="size-8" />
          <span className="font-display text-xl font-medium">Thread</span>
        </div>

        <div className="mx-auto flex w-full max-w-[380px] flex-1 flex-col justify-center py-10">
          <h2 className="font-display text-[34px] font-normal leading-tight text-zinc-900">Welcome back</h2>
          <p className="mt-2 text-[14px] text-zinc-500">Sign in with the account your administrator gave you.</p>

          <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
            <label className="block">
              <span className="mb-1.5 block text-[12.5px] font-medium text-zinc-700">Username</span>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
                <input
                  className={cn(inputClass, 'h-11 pl-9 text-[14px]', error?.code === 'INVALID_USER' && 'border-red-400 focus:border-red-500 focus:ring-red-500/15')}
                  autoComplete="username" autoFocus spellCheck={false} placeholder="firstname.lastname"
                  value={username} onChange={(e) => { setUsername(e.target.value); setError(null) }}
                  aria-invalid={error?.code === 'INVALID_USER'}
                />
              </div>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12.5px] font-medium text-zinc-700">Password</span>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
                <input
                  className={cn(inputClass, 'h-11 pl-9 pr-10 text-[14px]', error?.code === 'INVALID_PASSWORD' && 'border-red-400 focus:border-red-500 focus:ring-red-500/15')}
                  type={show ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••"
                  value={password} onChange={(e) => { setPassword(e.target.value); setError(null) }}
                  aria-invalid={error?.code === 'INVALID_PASSWORD'}
                />
                <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'}
                  className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </label>

            {error && (
              <div key={attempt} role="alert" className="flex animate-[shake_.3s] gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-[12.5px] text-red-800">
                <AlertTriangle className="mt-px size-4 shrink-0 text-red-600" />
                <div><div className="font-semibold">{errorTitle}</div><div className="mt-0.5 text-red-700/90">{error.message}</div></div>
              </div>
            )}

            <button type="submit" disabled={!username || !password || busy}
              className="group flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 text-[14px] font-medium text-white shadow-md transition hover:bg-zinc-800 active:translate-y-px disabled:pointer-events-none disabled:opacity-40">
              {busy ? 'Signing in…' : <>Sign in <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" /></>}
            </button>
          </form>

          {SHOW_DEMO && (
            <div className="mt-9">
              <div className="flex items-center gap-3 text-[11.5px] text-zinc-600">
                <span className="h-px flex-1 bg-zinc-200" />Or explore with a demo account<span className="h-px flex-1 bg-zinc-200" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {demoAccounts.map((e) => (
                  <button key={e.id} type="button" disabled={busy}
                    onClick={() => { setUsername(e.username); setPassword(credentials[e.username]); void signIn(e.username, credentials[e.username]) }}
                    className="flex items-center gap-2.5 rounded-xl border border-zinc-200 bg-white px-2.5 py-2 text-left shadow-xs transition hover:border-zinc-300 hover:shadow-sm disabled:opacity-50">
                    <span className={cn('grid size-7 shrink-0 place-items-center rounded-full text-[10px] font-semibold', avatarTone(e.id))}>{initials(e.name)}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-[12.5px] font-medium text-zinc-800">{e.name}</span>
                      <span className="block truncate text-[11px] text-zinc-500">{e.orgRole === 'employee' ? e.department : orgRoleLabel[e.orgRole]}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mx-auto flex w-full max-w-[380px] items-center justify-between text-[11.5px] text-zinc-600">
          <span className="flex items-center gap-1.5"><ShieldCheck className="size-3.5" />5 failed attempts lock the account</span>
          <span className="font-mono" title="VITE_API_MODE">{API_MODE === 'http' ? 'live' : 'demo'} mode</span>
        </div>
      </MintLagoonBackground>
    </div>
  )
}
