"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeftRight, ArrowRight, Briefcase, Clock, Inbox, ShieldAlert } from "lucide-react";
import { api, fmtDate, relDays, withinDays } from "@/lib/client";
import { label } from "@/lib/domain";
import { useMe } from "@/components/AppShell";
import { Avatar, Badge, Card, Empty, PageHeader, PageLoading, Ring, StatCard, cx } from "@/components/ui";

type Row = {
  id: string;
  title: string;
  caseType: string;
  status: string;
  priority: string;
  deadline: string | null;
  owner: { id: string; name: string };
  openActions: number;
  overdueActions: number;
  readiness: { score: number; blockers: number; warnings: number };
  activeHandoff: { id: string; state: string; toUserId: string } | null;
};

const PRIORITY_TONE = { CRITICAL: "bad", HIGH: "warn", MEDIUM: "neutral", LOW: "neutral" } as const;

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function Dashboard() {
  const me = useMe();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState<"mine" | "all">(me.role === "MEMBER" ? "mine" : "all");

  useEffect(() => {
    api<{ cases: Row[] }>("/api/cases").then((r) => setRows(r.cases));
  }, []);

  if (!rows) return <PageLoading />;

  const incoming = rows.filter((r) => r.activeHandoff?.state === "PENDING_ACCEPT" && r.activeHandoff.toUserId === me.id);
  const drafts = rows.filter((r) => r.activeHandoff?.state === "DRAFT" && r.owner.id === me.id);
  const active = rows.filter((r) => r.status !== "CLOSED");
  const shown = (filter === "mine" ? rows.filter((r) => r.owner.id === me.id) : rows).sort(
    (a, b) => Number(a.status === "CLOSED") - Number(b.status === "CLOSED") || a.readiness.score - b.readiness.score,
  );
  const scope =
    me.role === "MANAGER" ? `${me.team} team` : me.role === "AUDITOR" || me.role === "ADMIN" ? "All teams" : "Cases you own or work on";
  const notReady = active.filter((r) => r.readiness.blockers > 0).length;
  const overdue = active.reduce((s, r) => s + r.overdueActions, 0);
  const inFlight = active.filter((r) => r.activeHandoff).length;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
        title={`${greeting()}, ${me.name.split(" ")[0]}`}
        sub={scope}
      />

      {(incoming.length > 0 || drafts.length > 0) && (
        <section className="space-y-2.5" aria-label="Needs your attention">
          {incoming.map((r) => (
            <Link key={r.id} href={`/handoffs/${r.activeHandoff!.id}`} className="group block">
              <div className="flex items-center gap-4 rounded-xl border border-accent/30 bg-accent-soft px-4 py-3.5 transition hover:border-accent">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-white">
                  <Inbox size={18} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold">{r.owner.name} is handing you “{r.title}”</div>
                  <div className="text-sm text-ink-2">Review the context package before you accept responsibility.</div>
                </div>
                <span className="hidden items-center gap-1 text-sm font-medium text-accent sm:flex">
                  Review <ArrowRight size={16} className="transition group-hover:translate-x-0.5" aria-hidden />
                </span>
              </div>
            </Link>
          ))}
          {drafts.map((r) => (
            <Link key={r.id} href={`/cases/${r.id}/handoff`} className="group block">
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-sm transition hover:border-accent/50">
                <Badge tone="accent" dot>
                  Draft handoff
                </Badge>
                <span className="text-sm font-medium">{r.title}</span>
                <span className="text-sm text-muted">
                  {r.readiness.blockers ? `${r.readiness.blockers} blocker${r.readiness.blockers > 1 ? "s" : ""} left` : "Ready to submit"}
                </span>
                <span className="ml-auto flex items-center gap-1 text-sm font-medium text-accent">
                  Continue <ArrowRight size={16} aria-hidden />
                </span>
              </div>
            </Link>
          ))}
        </section>
      )}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Active cases" value={active.length} icon={Briefcase} />
        <StatCard label="Not ready to hand off" value={notReady} icon={ShieldAlert} tone={notReady ? "bad" : "good"} hint={notReady ? "Has blockers" : "All clear"} />
        <StatCard label="Overdue actions" value={overdue} icon={Clock} tone={overdue ? "warn" : "good"} />
        <StatCard label="Handoffs in flight" value={inFlight} icon={ArrowLeftRight} tone={inFlight ? "accent" : "neutral"} />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <div>
            <h2 className="text-[15px] font-semibold">{filter === "mine" ? "Owned by you" : "All visible cases"}</h2>
            <p className="text-[13px] text-muted">Least ready first</p>
          </div>
          <div className="flex rounded-lg bg-surface-3 p-0.5 text-sm" role="tablist" aria-label="Filter cases">
            {(["mine", "all"] as const).map((f) => (
              <button
                key={f}
                role="tab"
                aria-selected={filter === f}
                onClick={() => setFilter(f)}
                className={cx("rounded-md px-3 py-1 transition", filter === f ? "bg-surface font-medium text-ink shadow-sm" : "text-muted hover:text-ink")}
              >
                {f === "mine" ? "Mine" : "All"}
              </button>
            ))}
          </div>
        </div>
        {shown.length === 0 ? (
          <div className="p-5">
            <Empty title="No cases here yet." icon={Briefcase} />
          </div>
        ) : (
          <>
          <ul className="divide-y divide-line md:hidden">
            {shown.map((r) => (
              <li key={r.id}>
                <Link href={`/cases/${r.id}`} className={cx("flex items-center gap-3 px-4 py-3.5 active:bg-surface-2", r.status === "CLOSED" && "opacity-55")}>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium leading-snug">{r.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      <span>{r.owner.name}</span>
                      {r.overdueActions > 0 && <Badge tone="bad">{r.overdueActions} overdue</Badge>}
                      {r.deadline && <span>· due {relDays(r.deadline)}</span>}
                    </div>
                  </div>
                  {r.status !== "CLOSED" && <Ring score={r.readiness.score} blockers={r.readiness.blockers} size={30} />}
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-left text-xs font-medium uppercase tracking-wide text-muted">
                  <th className="px-5 py-2.5 font-medium">Case</th>
                  <th className="px-4 py-2.5 font-medium">Owner</th>
                  <th className="px-4 py-2.5 font-medium">Readiness</th>
                  <th className="px-4 py-2.5 font-medium">Actions</th>
                  <th className="px-5 py-2.5 font-medium">Deadline</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className={cx("group border-b border-line transition-colors last:border-0 hover:bg-surface-2", r.status === "CLOSED" && "opacity-55")}>
                    <td className="px-5 py-3.5">
                      <Link href={`/cases/${r.id}`} className="font-medium text-ink group-hover:text-accent">
                        {r.title}
                      </Link>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <Badge>{label(r.caseType)}</Badge>
                        <Badge tone={PRIORITY_TONE[r.priority as keyof typeof PRIORITY_TONE]} dot={r.priority === "HIGH" || r.priority === "CRITICAL"}>
                          {label(r.priority)}
                        </Badge>
                        {r.status !== "ACTIVE" && <Badge tone={r.status === "IN_HANDOFF" ? "accent" : "neutral"}>{label(r.status)}</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="flex items-center gap-2">
                        <Avatar name={r.owner.name} size={26} />
                        <span className="whitespace-nowrap">{r.owner.name}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      {r.status === "CLOSED" ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <div className="flex items-center gap-3">
                          <Ring score={r.readiness.score} blockers={r.readiness.blockers} />
                          <div className="text-xs leading-tight">
                            {r.readiness.blockers > 0 ? (
                              <div className="font-medium text-bad">
                                {r.readiness.blockers} blocker{r.readiness.blockers > 1 ? "s" : ""}
                              </div>
                            ) : (
                              <div className="text-good">No blockers</div>
                            )}
                            {r.readiness.warnings > 0 && (
                              <div className="text-muted">
                                {r.readiness.warnings} warning{r.readiness.warnings > 1 ? "s" : ""}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className="tabular-nums">{r.openActions}</span> <span className="text-muted">open</span>
                      {r.overdueActions > 0 && (
                        <Badge tone="bad" className="ml-2">
                          {r.overdueActions} overdue
                        </Badge>
                      )}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      {r.deadline ? (
                        <>
                          <div>{fmtDate(r.deadline, { day: "numeric", month: "short" })}</div>
                          <div className={cx("text-xs", withinDays(r.deadline, 7) ? "text-warn" : "text-muted")}>{relDays(r.deadline)}</div>
                        </>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Card>

      <Legend />
    </div>
  );
}

function Swatch({ color }: { color: string }) {
  return <span className="inline-block h-2 w-5 rounded-full" style={{ background: color }} />;
}

function Legend() {
  return (
    <details className="group rounded-xl border border-line bg-surface px-5 py-3.5 text-sm shadow-sm">
      <summary className="cursor-pointer list-none font-medium text-ink-2 marker:hidden">
        <span className="inline-flex items-center gap-2">
          Legend <span className="text-xs font-normal text-muted group-open:hidden">· what the colours and badges mean</span>
        </span>
      </summary>
      <div className="mt-4 grid gap-x-10 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Handoff readiness</div>
          <div className="flex items-center gap-2"><Swatch color="var(--bad)" /> Blockers: cannot change hands yet</div>
          <div className="flex items-center gap-2"><Swatch color="var(--warn)" /> Warnings only: fix or disclose</div>
          <div className="flex items-center gap-2"><Swatch color="var(--good)" /> Every check passes</div>
        </div>
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Badges</div>
          <div className="flex items-center gap-2"><Badge tone="bad" dot>Critical</Badge><Badge tone="warn" dot>High</Badge> priority</div>
          <div className="flex items-center gap-2"><Badge tone="bad">2 overdue</Badge> past their due date</div>
          <div className="flex items-center gap-2"><Badge tone="accent">In handoff</Badge> awaiting acceptance</div>
        </div>
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">On a case</div>
          <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-bad" /> Red dot on a tab: the gate found something there</div>
          <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-accent" /> Event, <span className="h-2 w-2 rounded-full bg-bad" /> escalation in the case log</div>
          <div className="flex items-center gap-2"><span className="font-semibold text-good">✓</span> / <span className="font-semibold text-bad">✕</span> history verified or tampered</div>
        </div>
      </div>
    </details>
  );
}
