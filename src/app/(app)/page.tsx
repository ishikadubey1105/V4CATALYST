"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, fmtDate, relDays } from "@/lib/client";
import { label } from "@/lib/domain";
import { useMe } from "@/components/AppShell";
import { Avatar, Badge, ButtonLink, Card, Empty, PageLoading, ScoreBar, cx } from "@/components/ui";

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
    (a, b) => Number(a.status === "CLOSED") - Number(b.status === "CLOSED"),
  );

  const scope =
    me.role === "MANAGER" ? `${me.team} team` : me.role === "AUDITOR" || me.role === "ADMIN" ? "All teams" : "Cases you own or work on";

  const kpis = [
    { label: "Active cases", value: active.length, tone: "neutral" },
    { label: "Not ready to hand off", value: active.filter((r) => r.readiness.blockers > 0).length, tone: "bad" },
    { label: "Overdue actions", value: active.reduce((s, r) => s + r.overdueActions, 0), tone: "warn" },
    { label: "Handoffs in flight", value: active.filter((r) => r.activeHandoff).length, tone: "accent" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cases</h1>
          <p className="text-sm text-muted">{scope}</p>
        </div>
        {me.role !== "AUDITOR" && (
          <ButtonLink href="/cases/new" variant="primary">
            New case
          </ButtonLink>
        )}
      </div>

      {incoming.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-accent">Waiting for you</h2>
          {incoming.map((r) => (
            <Link key={r.id} href={`/handoffs/${r.activeHandoff!.id}`} className="block">
              <Card className="flex items-center gap-4 border-accent/40 bg-accent-soft/40 p-4 transition hover:border-accent">
                <Avatar name={r.owner.name} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{r.title}</div>
                  <div className="text-sm text-muted">{r.owner.name} is handing this case to you. Review the context package and accept.</div>
                </div>
                <span className="text-sm font-medium text-accent">Review →</span>
              </Card>
            </Link>
          ))}
        </section>
      )}

      {drafts.length > 0 && (
        <section className="space-y-2">
          {drafts.map((r) => (
            <Link key={r.id} href={`/cases/${r.id}/handoff`} className="block">
              <Card className="flex items-center gap-3 p-3 text-sm transition hover:border-accent">
                <Badge tone="accent">Draft handoff</Badge>
                <span className="font-medium">{r.title}</span>
                <span className="text-muted">· {r.readiness.blockers} blocker(s) left</span>
                <span className="ml-auto text-accent">Continue →</span>
              </Card>
            </Link>
          ))}
        </section>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} className="p-4">
            <div className="text-xs text-muted">{k.label}</div>
            <div
              className={cx(
                "mt-1 text-2xl font-semibold tabular-nums",
                k.value > 0 && k.tone === "bad" && "text-bad",
                k.value > 0 && k.tone === "warn" && "text-warn",
                k.value > 0 && k.tone === "accent" && "text-accent",
              )}
            >
              {k.value}
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="font-semibold">{filter === "mine" ? "Owned by you" : "All visible cases"}</h2>
          <div className="flex rounded-lg bg-surface-2 p-0.5 text-sm">
            {(["mine", "all"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={cx("rounded-md px-3 py-1", filter === f ? "bg-surface font-medium shadow-sm" : "text-muted")}>
                {f === "mine" ? "Mine" : "All"}
              </button>
            ))}
          </div>
        </div>
        {shown.length === 0 ? (
          <div className="p-4">
            <Empty title="No cases here yet." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr className="border-b border-line">
                  <th className="px-4 py-2 font-medium">Case</th>
                  <th className="px-4 py-2 font-medium">Owner</th>
                  <th className="px-4 py-2 font-medium">Handoff readiness</th>
                  <th className="px-4 py-2 font-medium">Actions</th>
                  <th className="px-4 py-2 font-medium">Deadline</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className={cx("border-b border-line last:border-0 hover:bg-surface-2/60", r.status === "CLOSED" && "opacity-60")}>
                    <td className="px-4 py-3">
                      <Link href={`/cases/${r.id}`} className="font-medium hover:text-accent">
                        {r.title}
                      </Link>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <Badge>{label(r.caseType)}</Badge>
                        <Badge tone={PRIORITY_TONE[r.priority as keyof typeof PRIORITY_TONE]}>{label(r.priority)}</Badge>
                        {r.status !== "ACTIVE" && <Badge tone={r.status === "IN_HANDOFF" ? "accent" : "neutral"}>{label(r.status)}</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2">
                        <Avatar name={r.owner.name} size={24} />
                        <span className="whitespace-nowrap">{r.owner.name}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {r.status === "CLOSED" ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <>
                          <ScoreBar score={r.readiness.score} blockers={r.readiness.blockers} />
                          <div className="mt-1 text-xs text-muted">
                            {r.readiness.blockers > 0 ? (
                              <span className="text-bad">{r.readiness.blockers} blocker{r.readiness.blockers > 1 ? "s" : ""}</span>
                            ) : (
                              "No blockers"
                            )}
                            {r.readiness.warnings > 0 && ` · ${r.readiness.warnings} warning${r.readiness.warnings > 1 ? "s" : ""}`}
                          </div>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {r.openActions} open
                      {r.overdueActions > 0 && (
                        <Badge tone="bad" className="ml-2">
                          {r.overdueActions} overdue
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {r.deadline ? (
                        <>
                          <div>{fmtDate(r.deadline, { day: "numeric", month: "short" })}</div>
                          <div className="text-xs text-muted">{relDays(r.deadline)}</div>
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
        )}
      </Card>
    </div>
  );
}
