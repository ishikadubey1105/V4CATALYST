import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate, useOutlet } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Bell, ChartColumn, ChevronDown, Columns3, FolderOpen, Inbox, LogOut, OctagonAlert, RotateCcw, ScrollText, Settings2, Siren, Workflow } from 'lucide-react'
import { useMe, useStore } from '../store/useStore'
import { useAlerts } from '../store/useAlerts'
import { API_MODE, api } from '../api'
import { routeAccess } from '../lib/permissions'
import { cn, orgRoleLabel } from '../lib/utils'
import { Avatar, BrandMark } from './ui'
import { MintLagoonBackground } from './MintLagoonBackground'
import type { OrgRole } from '../lib/types'

type NavItem = { to: string; label: string; icon: typeof Bell; roles: OrgRole[] }

const sections: { title: string; items: NavItem[] }[] = [
  {
    title: 'Workspace',
    items: [
      { to: '/dashboard', label: 'My work', icon: Inbox, roles: routeAccess.any },
      { to: '/cases', label: 'Cases', icon: FolderOpen, roles: routeAccess.any },
      { to: '/board', label: 'Pipeline board', icon: Columns3, roles: routeAccess.any },
      { to: '/flow', label: 'Workflow', icon: Workflow, roles: routeAccess.any },
    ],
  },
  {
    title: 'Stay on top',
    items: [
      { to: '/alerts', label: 'Alerts', icon: Siren, roles: routeAccess.any },
      { to: '/notifications', label: 'Notifications', icon: Bell, roles: routeAccess.any },
    ],
  },
  {
    title: 'Insights',
    items: [
      { to: '/reports', label: 'Reports', icon: ChartColumn, roles: routeAccess.reports },
      { to: '/audit', label: 'Audit log', icon: ScrollText, roles: routeAccess.audit },
      { to: '/console', label: 'Admin console', icon: Settings2, roles: routeAccess.console },
    ],
  },
]

const accessNote: Record<OrgRole, string> = {
  employee: 'You see cases you own, receive, or have tasks on.',
  admin: 'You see every case and can reassign with a logged reason.',
  auditor: 'Read-only access to every case and the audit log.',
}

export function Layout() {
  const me = useMe()!
  const unread = useStore((s) => s.notifications.filter((n) => n.userId === me.id && !n.read).length)
  const resetDemo = useStore((s) => s.resetDemo)
  const toast = useStore((s) => s.toast)
  const alertCounts = useAlerts((s) => s.counts)
  const firstCritical = useAlerts((s) => s.alerts.find((a) => a.severity === 'critical'))
  const refreshAlerts = useAlerts((s) => s.refresh)
  const urgent = alertCounts.critical + alertCounts.high
  const navigate = useNavigate()
  const location = useLocation()
  const outlet = useOutlet() // frozen per route so the leaving page can animate out
  const reduceMotion = useReducedMotion()
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Deadline watcher. Mock: runs the job locally. HTTP: server runs it on a schedule; this just re-syncs.
  useEffect(() => {
    const tick = async () => {
      const n = await api.pollDeadlines().catch(() => 0)
      void refreshAlerts()
      if (n) toast({ tone: 'danger', title: `${n} task${n > 1 ? 's' : ''} became overdue`, body: 'Assignees and case owners have been notified.' })
    }
    void tick()
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [toast, refreshAlerts])

  useEffect(() => {
    const close = (e: MouseEvent) => menuRef.current && !menuRef.current.contains(e.target as Node) && setMenu(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const visibleSections = sections
    .map((s) => ({ ...s, items: s.items.filter((n) => n.roles.includes(me.orgRole)) }))
    .filter((s) => s.items.length)
  const flat = visibleSections.flatMap((s) => s.items)
  const badge = (to: string) => (to === '/alerts' ? urgent : to === '/notifications' ? unread : 0)
  const signOut = async () => { await api.logout(); navigate('/login') }

  return (
    <MintLagoonBackground className="flex min-h-screen overflow-clip">
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-zinc-200/80 bg-zinc-100/60 lg:flex print:hidden">
        <Link to="/dashboard" className="flex h-16 items-center gap-2.5 px-5">
          <BrandMark className="size-8" />
          <span className="leading-none">
            <span className="block font-display text-[19px] font-medium tracking-tight text-zinc-900">Thread</span>
            <span className="block text-[10.5px] tracking-wide text-zinc-500">Complaint handoffs</span>
          </span>
        </Link>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4 pt-2" aria-label="Main">
          {visibleSections.map((section) => (
            <div key={section.title}>
              <div className="mb-1.5 px-2.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-zinc-400">{section.title}</div>
              <div className="space-y-0.5">
                {section.items.map(({ to, label, icon: Icon }) => {
                  const n = badge(to)
                  return (
                    <NavLink
                      key={to}
                      to={to}
                      className={({ isActive }) => cn('group relative flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30',
                        isActive ? 'font-medium text-zinc-900' : 'text-zinc-600 hover:bg-zinc-200/50 hover:text-zinc-900')}
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && (
                            <motion.span layoutId="nav-active" aria-hidden="true" className="absolute inset-0 -z-0 rounded-lg bg-white shadow-sm ring-1 ring-zinc-200/70"
                              transition={{ type: 'spring', stiffness: 420, damping: 34 }} />
                          )}
                          <Icon className={cn('relative size-[17px]', isActive ? 'text-blue-700' : 'text-zinc-400 group-hover:text-zinc-600')} strokeWidth={1.8} />
                          <span className="relative">{label}</span>
                          {n > 0 && (
                            <span className={cn('relative ml-auto min-w-5 rounded-full px-1.5 text-center font-mono text-[10.5px] font-semibold leading-5',
                              to === '/alerts' ? 'bg-red-100 text-red-700' : 'bg-zinc-900 text-white')}>{n}</span>
                          )}
                        </>
                      )}
                    </NavLink>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="m-3 rounded-xl border border-zinc-200/80 bg-white p-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <Avatar user={me} size="md" />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-[13px] font-medium text-zinc-900">{me.name}</div>
              <div className="truncate text-[11px] text-zinc-500">{orgRoleLabel[me.orgRole]} · {me.department}</div>
            </div>
            <button onClick={signOut} title="Sign out" aria-label="Sign out" className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
              <LogOut className="size-4" />
            </button>
          </div>
          <p className="mt-2.5 text-[11px] leading-relaxed text-zinc-500">{accessNote[me.orgRole]}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-zinc-200/70 bg-paper/80 px-4 backdrop-blur-md sm:px-8 print:hidden">
          <Link to="/dashboard" className="lg:hidden" aria-label="Thread home"><BrandMark className="size-7" /></Link>
          <nav className="flex gap-1 overflow-x-auto lg:hidden" aria-label="Main">
            {flat.map(({ to, label }) => (
              <NavLink key={to} to={to} className={({ isActive }) => cn('whitespace-nowrap rounded-md px-2.5 py-1 text-xs', isActive ? 'bg-white font-medium shadow-sm' : 'text-zinc-600')}>{label}</NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            {me.orgRole === 'auditor' && <span className="mr-1 rounded-full border border-zinc-300 bg-white px-2.5 py-0.5 text-[11px] font-medium text-zinc-600">Read-only session</span>}
            <Link to="/notifications" className="relative grid size-9 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-200/60 hover:text-zinc-800" title="Notifications" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
              <Bell className="size-[18px]" strokeWidth={1.8} />
              {unread > 0 && <span className="absolute right-2 top-2 size-2 rounded-full bg-red-500 ring-2 ring-paper" />}
            </Link>
            <div className="relative" ref={menuRef}>
              <button onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-haspopup="menu" className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-zinc-200/60">
                <Avatar user={me} size="sm" />
                <span className="hidden text-[13px] font-medium text-zinc-800 sm:block">{me.name.split(' ')[0]}</span>
                <ChevronDown className="size-3.5 text-zinc-400" />
              </button>
              {menu && (
                <div role="menu" className="absolute right-0 mt-2 w-64 animate-rise overflow-hidden rounded-xl border border-zinc-200 bg-white py-1.5 shadow-lg">
                  <div className="border-b border-zinc-100 px-4 pb-3 pt-2">
                    <div className="text-[13px] font-medium">{me.name}</div>
                    <div className="font-mono text-[11px] text-zinc-500">@{me.username}</div>
                    <div className="mt-1 text-[11px] text-zinc-500">{me.title} · {orgRoleLabel[me.orgRole]}</div>
                  </div>
                  <button role="menuitem" onClick={signOut} className="mt-1 flex w-full items-center gap-2 px-4 py-2 text-[13px] text-zinc-700 hover:bg-zinc-50">
                    <LogOut className="size-3.5" />Sign out
                  </button>
                  {API_MODE === 'mock' && (
                    <button role="menuitem" onClick={() => { resetDemo(); navigate('/login') }} className="flex w-full items-center gap-2 px-4 py-2 text-[13px] text-zinc-500 hover:bg-zinc-50">
                      <RotateCcw className="size-3.5" />Reset demo database
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* the dashboard surfaces critical alerts itself, so the banner would repeat them */}
        {alertCounts.critical > 0 && location.pathname !== '/dashboard' && (
          <div className="px-4 pt-4 sm:px-8 print:hidden">
            <Link to="/alerts" role="alert" className="mx-auto flex max-w-[1360px] items-center gap-3 rounded-xl border border-red-200/80 bg-red-50/80 px-4 py-2.5 text-[13px] text-red-900 transition hover:bg-red-50">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-red-100"><OctagonAlert className="size-4 text-red-600" /></span>
              <b className="whitespace-nowrap font-semibold">{alertCounts.critical} critical alert{alertCounts.critical > 1 ? 's' : ''}</b>
              {firstCritical && <span className="truncate text-red-800/90">{firstCritical.title} · {firstCritical.caseCode}</span>}
              <span className="ml-auto flex items-center gap-1 whitespace-nowrap font-medium">Review <ArrowRight className="size-3.5" /></span>
            </Link>
          </div>
        )}

        <main className="mx-auto w-full max-w-[1360px] flex-1 px-4 py-7 sm:px-8">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={reduceMotion ? false : { opacity: 0, y: 14, filter: 'blur(3px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -8, transition: { duration: 0.14 } }}
              transition={{ duration: 0.32, ease: [0.2, 0.7, 0.2, 1] }}
            >
              {outlet}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </MintLagoonBackground>
  )
}
