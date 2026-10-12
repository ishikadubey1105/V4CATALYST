import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AlertTriangle, Lock, User } from 'lucide-react'
import { API_MODE, api, useAction } from '../api'
import { Button, Field, inputClass } from '../components/ui'
import { cn } from '../lib/utils'

/** Sign-in against POST /auth/login. Only provisioned accounts can enter; anything else is rejected. */
export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<{ code: string; message: string } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const { pending } = useAction()
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api.login(username, password)
      navigate((location.state as { from?: string } | null)?.from ?? '/dashboard', { replace: true })
    } catch (err) {
      const ex = err as { code?: string; message?: string }
      setError({ code: ex.code ?? 'ERROR', message: ex.message ?? 'Sign-in failed.' })
      setAttempt((a) => a + 1)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-100">
      <header className="flex h-12 items-center gap-2 bg-zinc-800 px-6 text-zinc-100">
        <img src="/baton.svg" className="size-6" alt="" />
        <span className="text-sm font-semibold">Baton</span>
        <span className="text-xs text-zinc-400">Complaint handoff console</span>
      </header>

      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <form onSubmit={submit} className="w-full max-w-sm rounded-md border border-zinc-300 bg-white shadow-sm">
          <div className="border-b border-zinc-200 px-6 py-5">
            <h1 className="text-base font-semibold text-zinc-900">Sign in to your account</h1>
            <p className="mt-1 text-xs text-zinc-500">Use the username and password issued by your administrator.</p>
          </div>

          <div className="space-y-4 px-6 py-5">
            <Field label="Username">
              <div className="relative">
                <User className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-zinc-400" />
                <input
                  className={cn(inputClass, 'pl-8', error?.code === 'INVALID_USER' && 'border-red-500 focus:border-red-600 focus:ring-red-600')}
                  autoComplete="username" autoFocus spellCheck={false}
                  value={username} onChange={(e) => { setUsername(e.target.value); setError(null) }} placeholder="firstname.lastname"
                />
              </div>
            </Field>
            <Field label="Password">
              <div className="relative">
                <Lock className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-zinc-400" />
                <input
                  className={cn(inputClass, 'pl-8', error?.code === 'INVALID_PASSWORD' && 'border-red-500 focus:border-red-600 focus:ring-red-600')}
                  type="password" autoComplete="current-password"
                  value={password} onChange={(e) => { setPassword(e.target.value); setError(null) }}
                />
              </div>
            </Field>

            {error && (
              <div key={attempt} role="alert" className="animate-[shake_.3s] flex gap-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
                <AlertTriangle className="mt-px size-3.5 shrink-0" />
                <div>
                  <div className="font-semibold">{error.code === 'INVALID_USER' ? 'Invalid user' : error.code === 'INVALID_PASSWORD' ? 'Invalid password' : 'Access denied'}</div>
                  <div>{error.message}</div>
                </div>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={!username || !password || busy || pending}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </div>

          <div className="flex items-center justify-between border-t border-zinc-200 bg-zinc-50 px-6 py-3 text-[11px] text-zinc-500">
            <span>5 failed attempts lock the account.</span>
            <span className="font-mono" title="VITE_API_MODE">api: {API_MODE}</span>
          </div>
        </form>
      </div>
    </div>
  )
}
