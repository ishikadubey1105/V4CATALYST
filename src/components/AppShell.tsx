"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api, timeAgo } from "@/lib/client";
import { Avatar, Badge, PageLoading, cx } from "./ui";

export type Me = { id: string; name: string; email: string; role: string; team: string; title: string | null };

const MeContext = createContext<Me | null>(null);

export function useMe() {
  const me = useContext(MeContext);
  if (!me) throw new Error("useMe outside AppShell");
  return me;
}

const ROLE_TONE: Record<string, "accent" | "good" | "warn" | "neutral"> = {
  ADMIN: "warn",
  MANAGER: "accent",
  AUDITOR: "good",
  MEMBER: "neutral",
};

export function RoleBadge({ role }: { role: string }) {
  return <Badge tone={ROLE_TONE[role] ?? "neutral"}>{role.charAt(0) + role.slice(1).toLowerCase()}</Badge>;
}

type Notif = { id: string; kind: string; body: string; caseId: string | null; handoffId: string | null; readAt: string | null; createdAt: string };

function Bell() {
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
    else if (n.caseId) router.push(`/cases/${n.caseId}`);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
        aria-label={`Notifications, ${data.unread} unread`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {data.unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-bad px-1 text-[10px] font-bold text-white">
            {data.unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <span className="text-sm font-semibold">Notifications</span>
            {data.unread > 0 && (
              <button
                className="text-xs text-accent hover:underline"
                onClick={async () => {
                  await api("/api/notifications/read-all", { method: "POST" });
                  load();
                }}
              >
                Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {data.items.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">Nothing yet.</li>}
            {data.items.map((n) => (
              <li key={n.id}>
                <button onClick={() => openItem(n)} className={cx("flex w-full gap-3 px-4 py-3 text-left hover:bg-surface-2", !n.readAt && "bg-accent-soft/40")}>
                  <span className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-accent")} />
                  <span className="min-w-0">
                    <span className="block text-sm text-ink">{n.body}</span>
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

export function AppShell({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    api<{ user: Me }>("/api/me").then((r) => setMe(r.user)).catch(() => {});
  }, []);

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const nav = [
    { href: "/", label: "Cases" },
    ...(me?.role === "ADMIN" || me?.role === "MANAGER" ? [{ href: "/admin/rules", label: "Gate policy" }] : []),
  ];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-accent-ink">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12h12M12 6l6 6-6 6" />
              </svg>
            </span>
            Relay
          </Link>
          <nav className="flex items-center gap-1">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={cx(
                  "rounded-md px-3 py-1.5 text-sm",
                  (n.href === "/" ? pathname === "/" || pathname.startsWith("/cases") || pathname.startsWith("/handoffs") : pathname.startsWith(n.href))
                    ? "bg-surface-2 font-medium text-ink"
                    : "text-muted hover:text-ink",
                )}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {me && (
              <>
                <Bell />
                <div className="hidden items-center gap-2 border-l border-line pl-3 sm:flex">
                  <Avatar name={me.name} />
                  <div className="leading-tight">
                    <div className="text-sm font-medium">{me.name}</div>
                    <div className="text-xs text-muted">{me.title}</div>
                  </div>
                  <RoleBadge role={me.role} />
                </div>
                <button onClick={logout} className="rounded-md px-2 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-ink">
                  Sign out
                </button>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{me ? <MeContext value={me}>{children}</MeContext> : <PageLoading />}</main>
    </div>
  );
}
