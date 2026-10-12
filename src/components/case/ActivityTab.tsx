"use client";

import { useCallback, useEffect, useState } from "react";
import { api, fmtDateTime } from "@/lib/client";
import { Badge, Button, Card, Mono, PageLoading, cx, shortHash } from "../ui";
import type { TabProps } from "./types";

type Entry = { id: string; seq: number; actorId: string; verb: string; targetType: string; targetId: string | null; payload: Record<string, unknown>; createdAt: string; prevHash: string; hash: string };
type Report =
  | { ok: true; entriesChecked: number; headHash: string; verifiedAt: string }
  | { ok: false; entriesChecked: number; brokenAtSeq: number; reason: string; expectedHash: string; foundHash: string; verifiedAt: string };

const VERBS: Record<string, string> = {
  "case.created": "opened the case",
  "case.updated": "edited the case",
  "case.closed": "closed the case",
  "case.reassigned": "reassigned the case, bypassing the gate",
  "context.added": "added context",
  "context.updated": "edited context",
  "context.resolved": "resolved a question",
  "context.removed": "removed context",
  "decision.recorded": "recorded a decision",
  "decision.updated": "updated a decision",
  "action.created": "added an action",
  "action.updated": "updated an action",
  "action.status_changed": "changed an action's status",
  "document.attached": "attached a document",
  "handoff.initiated": "started a handoff",
  "handoff.retargeted": "changed the handoff recipient",
  "handoff.warning_waived": "waived a warning",
  "handoff.waiver_withdrawn": "withdrew a waiver",
  "handoff.submitted": "submitted the handoff",
  "handoff.accepted": "accepted the handoff",
  "handoff.rejected": "rejected the handoff",
  "handoff.cancelled": "cancelled the handoff",
};

const REASONS: Record<string, string> = {
  HASH_MISMATCH: "its contents no longer match its recorded hash",
  LINK_MISMATCH: "it no longer points at the entry before it",
  SEQ_GAP: "an entry is missing from the sequence",
  HEAD_MISMATCH: "the newest entries were removed",
};

function detail(e: Entry, names: Record<string, string>) {
  const p = e.payload;
  const n = (id: unknown) => (typeof id === "string" ? (names[id] ?? id) : "");
  if (typeof p.title === "string") return `“${p.title}”`;
  if (typeof p.filename === "string") return `${p.filename}`;
  if (e.verb === "handoff.warning_waived") return `${p.code}: “${p.justification}”`;
  if (e.verb.startsWith("handoff.") && p.to) return `to ${n(p.to)}`;
  if (e.verb === "handoff.accepted") return `acknowledged package ${shortHash(String(p.acknowledgedSnapshotHash))}`;
  if (e.verb === "case.reassigned") return `to ${n(p.to)} at ${p.readinessAtBypass}% readiness: “${p.reason}”`;
  if (Array.isArray(p.fields)) return (p.fields as string[]).join(", ");
  return "";
}

export function ActivityTab({ data }: TabProps) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [showHashes, setShowHashes] = useState(false);

  const load = useCallback(() => api<{ entries: Entry[] }>(`/api/cases/${data.case.id}/activity`).then((r) => setEntries(r.entries)), [data.case.id]);
  useEffect(() => {
    load();
  }, [load]);

  async function verify() {
    setVerifying(true);
    setReport(null);
    await load();
    // A short pause so the check reads as a check, not a cached flag.
    const [r] = await Promise.all([api<Report>(`/api/cases/${data.case.id}/verify-chain`), new Promise((res) => setTimeout(res, 500))]);
    setReport(r);
    setVerifying(false);
  }

  if (!entries) return <PageLoading />;
  const broken = report && !report.ok ? report.brokenAtSeq : null;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">Tamper-evident history</h2>
            <p className="text-sm text-muted">
              Every entry hashes the one before it. Editing or deleting any past entry — even directly in the database — breaks the chain from that point.
            </p>
          </div>
          <Button variant="primary" onClick={verify} loading={verifying}>
            Verify integrity
          </Button>
        </div>
        {report?.ok && (
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-good/30 bg-good-soft px-4 py-3">
            <span className="text-xl text-good">✓</span>
            <div className="text-sm">
              <div className="font-semibold text-good">Chain intact — all {report.entriesChecked} entries verified.</div>
              <div className="mt-0.5 text-muted">
                Head <Mono>{shortHash(report.headHash)}</Mono> · checked {fmtDateTime(report.verifiedAt)}
              </div>
            </div>
          </div>
        )}
        {report && !report.ok && (
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-bad/40 bg-bad-soft px-4 py-3">
            <span className="text-xl text-bad">✕</span>
            <div className="min-w-0 text-sm">
              <div className="font-semibold text-bad">
                Tampering detected at entry #{report.brokenAtSeq} — {REASONS[report.reason] ?? report.reason}.
              </div>
              <div className="mt-1 space-y-0.5 text-muted">
                <div>
                  Expected <Mono>{shortHash(report.expectedHash)}</Mono>
                </div>
                <div>
                  Found&nbsp;&nbsp;&nbsp;&nbsp;<Mono>{shortHash(report.foundHash)}</Mono>
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>

      <div className="flex justify-end">
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={showHashes} onChange={(e) => setShowHashes(e.target.checked)} /> Show hashes
        </label>
      </div>

      <Card>
        <ol>
          {entries.map((e) => (
            <li
              key={e.id}
              className={cx(
                "flex gap-3 border-b border-line px-4 py-3 last:border-0",
                broken === e.seq && "bg-bad-soft",
                broken !== null && e.seq > broken && "bg-bad-soft/40",
              )}
            >
              <span className={cx("mt-0.5 w-8 shrink-0 text-right font-mono text-xs", broken === e.seq ? "font-bold text-bad" : "text-muted")}>#{e.seq}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm">
                  <span className="font-medium">{data.names[e.actorId] ?? e.actorId}</span> {VERBS[e.verb] ?? e.verb}{" "}
                  <span className="text-muted">{detail(e, data.names)}</span>
                  {e.verb === "case.reassigned" && <Badge tone="warn" className="ml-2">Gate bypassed</Badge>}
                </div>
                <div className="text-xs text-muted">{fmtDateTime(e.createdAt)}</div>
                {showHashes && (
                  <div className="mt-1 space-y-0.5">
                    <Mono className="block">prev {e.prevHash}</Mono>
                    <Mono className="block">hash {e.hash}</Mono>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
