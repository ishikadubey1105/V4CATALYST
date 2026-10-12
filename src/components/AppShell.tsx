"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Bell, LayoutGrid, LogOut, Menu, Plus, ShieldCheck, SlidersHorizontal, X } from "lucide-react";
import { api, timeAgo } from "@/lib/client";
import { Avatar, Badge, PageLoading, cx, Logo } from "./ui";

export type Me = { id: string; name: string; email: string; role: string; team: string; title: string | null };

const MeContext = createContext<Me | null>(null);

export function useMe() {
  const me = useContext(MeContext);
  if (!me) throw new Error("useMe outside AppShell");
  return me;
}

const ROLE_TONE: Record<string, "accent" | "good" | "warn" | "neutral"> = { ADMIN: "warn", MANAGER: "accent", AUDITOR: "good", MEMBER: "neutral" };

export function RoleBadge({ role }: { role: string }) {
  return <Badge tone={ROLE_TONE[role] ?? "neutral"}>{role.charAt(0) + role.slice(1).toLowerCase()}</Badge>;
}

type Notif = { id: string; kind: string; body: string; caseId: string | null; handoffId: string | null; readAt: string | null; createdAt: string };

function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ items: Notif[]; unread: number }>({ items: [], unread: 0 });
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    api<{ items: Notif[]; unread: number }>("/api/notifications").then(setData).catch(() => {});
  }, []);

  // Polling, deliberately: a 10-second poll is indistinguishable from a socket in a
  // demo and has no connection state to fail.
  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  async function openItem(n: Notif) {
    setOpen(false);
    if (!n.readAt) await api(`/api/notifications/${n.id}/read`, { method: "POST" }).catch(() => {});
    load();
    if (n.handoffId && n.kind === "handoff.received") router.push(`/handoffs/${n.handoffId}`);
    else if (n.caseId) router.push(`/cases/${n.caseId}${n.kind === "case.update" ? "?tab=updates" : ""}`);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-ink-2 transition hover:bg-surface-3 hover:text-ink"
        aria-label={`Notifications, ${data.unread} unread`}
        aria-expanded={open}
      >
        <Bell size={18} aria-hidden />
        {data.unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-bad px-1 text-[10px] font-semibold text-white ring-2 ring-surface">
            {data.unread}
          </span>
        )}
      </button>
      {open && (
        <div className="rise absolute right-0 z-40 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-sm font-semibold">Notifications</span>
            {data.unread > 0 && (
              <button
                className="text-xs font-medium text-accent hover:underline"
                onClick={async () => {
                  await api("/api/notifications/read-all", { method: "POST" });
                  load();
                }}
              >
                Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-[26rem] overflow-y-auto">
            {data.items.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">You&apos;re all caught up.</li>}
            {data.items.map((n) => (
              <li key={n.id} className="border-b border-line last:border-0">
                <button onClick={() => openItem(n)} className={cx("flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2", !n.readAt && "bg-accent-soft/50")}>
                  <span className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.readAt ? "bg-line-strong" : "bg-accent")} />
                  <span className="min-w-0">
                    <span className="block text-sm leading-snug text-ink">{n.body}</span>
                    <span className="text-xs text-muted">{timeAgo(n.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Sidebar({ me, onNavigate }: { me: Me; onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/login");
    router.refresh();
  }

  const nav = [
    { href: "/", label: "Cases", icon: LayoutGrid, active: pathname === "/" || pathname.startsWith("/cases") || pathname.startsWith("/handoffs") },
    { href: "/security", label: "Security", icon: ShieldCheck, active: pathname.startsWith("/security") },
    ...(me.role === "ADMIN" || me.role === "MANAGER"
      ? [{ href: "/admin/rules", label: "Gate policy", icon: SlidersHorizontal, active: pathname.startsWith("/admin") }]
      : []),
  ];

  return (
    <div className="flex h-full flex-col bg-chrome text-chrome-ink">
      <Link href="/" onClick={onNavigate} className="flex h-16 items-center gap-2.5 px-5">
        <Logo size={28} />
        <span className="text-[17px] font-semibold tracking-tight">Relay</span>
      </Link>

      {me.role !== "AUDITOR" && (
        <div className="px-3 pb-2">
          <Link
            href="/cases/new"
            onClick={onNavigate}
            className="flex h-9 items-center justify-center gap-2 rounded-lg bg-[#2f54eb] text-sm font-medium text-white shadow-sm transition hover:bg-[#2445cf]"
          >
            <Plus size={16} aria-hidden /> New case
          </Link>
        </div>
      )}

      <nav className="mt-2 flex-1 space-y-0.5 px-3" aria-label="Main">
        {nav.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            onClick={onNavigate}
            aria-current={n.active ? "page" : undefined}
            className={cx(
              "flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
              n.active ? "bg-chrome-2 font-medium text-white" : "text-chrome-muted hover:bg-chrome-2/60 hover:text-chrome-ink",
            )}
          >
            <n.icon size={17} aria-hidden className={n.active ? "text-[#9fb3ff]" : ""} />
            {n.label}
          </Link>
        ))}
      </nav>

      <div className="border-t border-chrome-line p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <Avatar name={me.name} size={34} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-sm font-medium text-white">{me.name}</div>
            <div className="truncate text-xs text-chrome-muted">
              {me.role.charAt(0) + me.role.slice(1).toLowerCase()} · {me.team}
            </div>
          </div>
          <button onClick={logout} className="rounded-md p-1.5 text-chrome-muted transition hover:bg-chrome-2 hover:text-white" aria-label="Sign out" title="Sign out">
            <LogOut size={17} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [drawer, setDrawer] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    api<{ user: Me }>("/api/me").then((r) => setMe(r.user)).catch(() => {});
  }, []);

  if (!me) return <PageLoading />;

  return (
    <MeContext value={me}>
      <div className="min-h-screen lg:pl-60">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 lg:block">
          <Sidebar me={me} />
        </aside>

        {drawer && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
            <div className="absolute inset-0 bg-chrome/60" onClick={() => setDrawer(false)} />
            <div className="rise absolute inset-y-0 left-0 w-64 shadow-lg">
              <Sidebar me={me} onNavigate={() => setDrawer(false)} />
            </div>
            <button onClick={() => setDrawer(false)} className="absolute left-[16.5rem] top-4 rounded-lg bg-surface p-2 text-ink" aria-label="Close menu">
              <X size={18} />
            </button>
          </div>
        )}

        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-surface/85 px-4 backdrop-blur sm:px-6 lg:px-8">
          <button onClick={() => setDrawer(true)} className="-ml-1 rounded-lg p-2 text-ink-2 hover:bg-surface-3 lg:hidden" aria-label="Open menu">
            <Menu size={20} />
          </button>
          <Link href="/" className="flex items-center gap-2 font-semibold lg:hidden">
            <Logo size={24} /> Relay
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-[13px] text-muted sm:inline">{me.title}</span>
            <RoleBadge role={me.role} />
            <NotificationBell />
          </div>
        </header>

        <main key={pathname} className="rise mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </MeContext>
  );
}
