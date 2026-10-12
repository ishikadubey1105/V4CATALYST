"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, fmtDate, fmtDateTime } from "@/lib/client";
import { label } from "@/lib/domain";
import { Avatar, Badge, Card, Mono, PageLoading, shortHash } from "../ui";
import type { TabProps } from "./types";

type Period = { id: string; userId: string; via: string; handoffId: string | null; note: string | null; startedAt: string; endedAt: string | null };
type H = {
  id: string;
  fromUserId: string;
  toUserId: string;
  state: string;
  reason: string;
  readinessScore: number | null;
  snapshotHash: string | null;
  responseNote: string | null;
  submittedAt: string | null;
  respondedAt: string | null;
  initiatedAt: string;
  waivers: { code: string; justification: string; userId: string; at: string }[];
};

const STATE_TONE: Record<string, "good" | "bad" | "accent" | "neutral"> = { ACCEPTED: "good", REJECTED: "bad", PENDING_ACCEPT: "accent", DRAFT: "neutral", CANCELLED: "neutral" };

export function OwnershipTab({ data }: TabProps) {
  const [d, setD] = useState<{ periods: Period[]; handoffs: H[]; names: Record<string, string> } | null>(null);
  useEffect(() => {
    api<{ periods: Period[]; handoffs: H[]; names: Record<string, string> }>(`/api/cases/${data.case.id}/ownership`).then(setD);
  }, [data.case.id]);
  if (!d) return <PageLoading />;
  const name = (id: string) => d.names[id] ?? id;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <Card className="p-5">
        <h2 className="mb-1 font-semibold">Who was responsible, when</h2>
        <p className="mb-4 text-sm text-muted">Exactly one accountable owner at any moment.</p>
        <ol className="relative space-y-5 border-l border-line pl-5">
          {d.periods.map((p) => (
            <li key={p.id} className="relative">
              <span className={`absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-surface ${p.endedAt ? "bg-muted" : "bg-accent"}`} />
              <div className="flex items-center gap-2">
                <Avatar name={name(p.userId)} size={24} />
                <span className="font-medium">{name(p.userId)}</span>
                {!p.endedAt && <Badge tone="accent">Current owner</Badge>}
              </div>
              <div className="mt-1 text-sm text-muted">
                {fmtDate(p.startedAt)} → {p.endedAt ? fmtDate(p.endedAt) : "now"} · via {label(p.via).toLowerCase()}
              </div>
              {p.via === "REASSIGN" && p.note && (
                <div className="mt-1 rounded-md bg-warn-soft px-2 py-1 text-sm text-warn">Gate bypassed by a manager: “{p.note}”</div>
              )}
            </li>
          ))}
        </ol>
      </Card>

      <div className="space-y-3">
        <h2 className="font-semibold">Handoffs</h2>
        {d.handoffs.length === 0 && <p className="text-sm text-muted">This case has never changed hands.</p>}
        {[...d.handoffs].reverse().map((h) => (
          <Card key={h.id} className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">
                {name(h.fromUserId)} → {name(h.toUserId)}
              </span>
              <Badge tone={STATE_TONE[h.state]}>{label(h.state)}</Badge>
              {h.readinessScore !== null && <Badge>{h.readinessScore}% at submission</Badge>}
              <Link href={`/handoffs/${h.id}`} className="ml-auto text-sm text-accent hover:underline">
                Open package
              </Link>
            </div>
            <p className="mt-2 text-sm">
              <span className="text-muted">Reason: </span>
              {h.reason}
            </p>
            <div className="mt-1 text-xs text-muted">
              Started {fmtDateTime(h.initiatedAt)}
              {h.submittedAt && ` · submitted ${fmtDateTime(h.submittedAt)}`}
              {h.respondedAt && ` · answered ${fmtDateTime(h.respondedAt)}`}
            </div>
            {h.waivers.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <div className="text-xs font-semibold uppercase tracking-wide text-warn">Gaps disclosed at transfer</div>
                {h.waivers.map((w) => (
                  <div key={w.code} className="rounded-md bg-warn-soft/60 px-3 py-2 text-sm">
                    <code className="font-mono text-xs text-warn">{w.code}</code> — “{w.justification}”{" "}
                    <span className="text-muted">— {name(w.userId)}</span>
                  </div>
                ))}
              </div>
            )}
            {h.responseNote && (
              <p className="mt-2 text-sm">
                <span className="text-muted">{h.state === "REJECTED" ? "Returned because: " : "Receiver's note: "}</span>“{h.responseNote}”
              </p>
            )}
            {h.snapshotHash && (
              <div className="mt-2">
                <Mono>package {shortHash(h.snapshotHash)}</Mono>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
