import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Bell, ChevronDown, Columns3, FolderOpen, Inbox, LogOut, RotateCcw, ScrollText, Settings2, Workflow } from 'lucide-react'
import { useMe, useStore } from '../store/useStore'
import { API_MODE, api } from '../api'
import { routeAccess } from '../lib/permissions'
import { cn, orgRoleLabel } from '../lib/utils'
import { Avatar } from './ui'
import type { OrgRole } from '../lib/types'

const nav: { to: string; label: string; icon: typeof Bell; roles: OrgRole[] }[] = [
  { to: '/dashboard', label: 'My work', icon: Inbox, roles: routeAccess.any },
  { to: '/cases', label: 'Cases', icon: FolderOpen, roles: routeAccess.any },
  { to: '/flow', label: 'Workflow', icon: Workflow, roles: routeAccess.any },
  { to: '/board', label: 'Pipeline board', icon: Columns3, roles: routeAccess.any },
  { to: '/notifications', label: 'Notifications', icon: Bell, roles: routeAccess.any },
  { to: '/console', label: 'Admin console', icon: Settings2, roles: routeAccess.console },
  { to: '/audit', label: 'Audit log', icon: ScrollText, roles: routeAccess.audit },
]

export function Layout() {
  const me = useMe()!
  const unread = useStore((s) => s.notifications.filter((n) => n.userId === me.id && !n.read).length)
  const resetDemo = useStore((s) => s.resetDemo)
  const toast = useStore((s) => s.toast)
  const navigate = useNavigate()
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Deadline watcher. Mock: runs the job locally. HTTP: server runs it on a schedule; this just re-syncs.
  useEffect(() => {
    const tick = async () => {
      const n = await api.pollDeadlines().catch(() => 0)
      if (n) toast({ tone: 'danger', title: `${n} task${n > 1 ? 's' : ''} became overdue`, body: 'Assignees and case owners have been notified.' })
    }
    void tick()
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [toast])

  useEffect(() => {
    const close = (e: MouseEvent) => menuRef.current && !menuRef.current.contains(e.target as Node) && setMenu(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const items = nav.filter((n) => n.roles.includes(me.orgRole))
  const signOut = async () => { await api.logout(); navigate('/login') }

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col bg-zinc-800 text-zinc-300 lg:flex">
        <Link to="/dashboard" className="flex h-12 items-center gap-2 border-b border-zinc-700 px-4">
          <img src="/baton.svg" className="size-6 ring-1 ring-zinc-500" alt="" />
          <span className="text-sm font-semibold tracking-tight text-white">Baton</span>
          <span className="ml-auto font-mono text-[10px] text-zinc-500">console</span>
        </Link>
        <nav className="flex-1 space-y-px p-2">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => cn('flex items-center gap-2.5 rounded px-2.5 py-1.5 text-[13px]',
                isActive ? 'bg-zinc-600 font-medium text-white' : 'hover:bg-zinc-700 hover:text-white')}
            >
              <Icon className="size-4" strokeWidth={1.75} />
              {label}
              {to === '/notifications' && unread > 0 && <span className="ml-auto rounded-sm bg-red-600 px-1.5 font-mono text-[10px] font-semibold text-white">{unread}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-zinc-700 p-3 text-[11px] leading-relaxed text-zinc-400">
          Access level: <b className="text-zinc-100">{orgRoleLabel[me.orgRole]}</b><br />
          {me.orgRole === 'employee' && 'You see cases you own, receive, or have tasks on.'}
          {me.orgRole === 'admin' && 'You see all cases and can reassign with a logged reason.'}
          {me.orgRole === 'auditor' && 'Read-only access to every case and the audit log.'}
          <div className="mt-2 font-mono text-[10px] text-zinc-500">api mode: {API_MODE}</div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-zinc-300 bg-white px-4 sm:px-6">
          <nav className="flex gap-1 overflow-x-auto lg:hidden">
            {items.map(({ to, label }) => (
              <NavLink key={to} to={to} className={({ isActive }) => cn('whitespace-nowrap rounded px-2 py-1 text-xs', isActive ? 'bg-zinc-200 font-medium' : 'text-zinc-600')}>{label}</NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            {me.orgRole === 'auditor' && <span className="mr-2 rounded-sm border border-zinc-300 px-1.5 py-px text-[11px] text-zinc-600">READ-ONLY SESSION</span>}
            <Link to="/notifications" className="relative rounded p-2 text-zinc-500 hover:bg-zinc-100" title="Notifications">
              <Bell className="size-4" />
              {unread > 0 && <span className="absolute right-1 top-1 size-2 rounded-full bg-red-600" />}
            </Link>
            <div className="relative" ref={menuRef}>
              <button onClick={() => setMenu((m) => !m)} className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-zinc-100">
                <Avatar user={me} size="sm" />
                <span className="hidden text-left sm:block">
                  <span className="block text-[13px] leading-tight">{me.name}</span>
                  <span className="block text-[11px] leading-tight text-zinc-500">{me.department}</span>
                </span>
                <ChevronDown className="size-3.5 text-zinc-400" />
              </button>
              {menu && (
                <div className="absolute right-0 mt-1 w-64 rounded-md border border-zinc-300 bg-white py-1 shadow-lg">
                  <div className="border-b border-zinc-200 px-3 py-2">
                    <div className="text-[13px] font-medium">{me.name}</div>
                    <div className="font-mono text-[11px] text-zinc-500">@{me.username}</div>
                    <div className="mt-1 text-[11px] text-zinc-500">{me.title} · {orgRoleLabel[me.orgRole]}</div>
                  </div>
                  <button onClick={signOut} className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] hover:bg-zinc-50">
                    <LogOut className="size-3.5" />Sign out
                  </button>
                  {API_MODE === 'mock' && (
                    <button onClick={() => { resetDemo(); navigate('/login') }} className="flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-zinc-500 hover:bg-zinc-50">
                      <RotateCcw className="size-3.5" />Reset demo database
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-5 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
