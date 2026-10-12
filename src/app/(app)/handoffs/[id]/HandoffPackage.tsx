"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { api, ApiError, fmtDate, fmtDateTime, relDays } from "@/lib/client";
import { label } from "@/lib/domain";
import { Avatar, Badge, Button, Card, ErrorNote, Field, Mono, Modal, PageLoading, Textarea, cx, shortHash } from "@/components/ui";

type Snapshot = {
  handoff: { from: string; to: string; reason: string; submittedAt: string };
  case: { id: string; title: string; summary: string; caseType: string; priority: string; deadline: string | null };
  context: { id: string; kind: string; title: string; body: string; resolution: string | null; author: string; createdAt: string }[];
  decisions: { id: string; title: string; rationale: string; decidedBy: string; decidedAt: string; supersedesId: string | null }[];
  actions: { id: string; title: string; status: string; assignee: string | null; dueDate: string | null; blockedReason: string | null; note: string | null }[];
  documents: { id: string; filename: string; docClass: string; sha256: string }[];
  readiness: { score: number };
  waivers: { code: string; justification: string; by: string; at: string }[];
  updates?: { id: string; kind: string; body: string; author: string; occurredAt: string }[];
};
type LiveUpdate = { id: string; kind: string; body: string; authorId: string; occurredAt: string };
type Resp = {
  handoff: { id: string; caseId: string; state: string; fromUserId: string; toUserId: string; reason: string; snapshotHash: string | null; responseNote: string | null; submittedAt: string | null; respondedAt: string | null; readinessScore: number | null };
  case: { id: string; title: string };
  snapshot: Snapshot | null;
  snapshotIntact: boolean | null;
  updatesSince: LiveUpdate[];
  names: Record<string, string>;
  permissions: { manage: boolean; cancel: boolean; respond: boolean };
};

const STATE_TONE: Record<string, "good" | "bad" | "accent" | "neutral"> = { ACCEPTED: "good", REJECTED: "bad", PENDING_ACCEPT: "accent", CANCELLED: "neutral", DRAFT: "neutral" };
const KIND_ORDER = ["RISK", "CONSTRAINT", "OPEN_QUESTION", "STAKEHOLDER", "BACKGROUND"];

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-semibold">{title}</h2>
      {hint && <p className="mb-3 text-sm text-muted">{hint}</p>}
      {!hint && <div className="mb-3" />}
      {children}
    </section>
  );
}

export function HandoffPackage({ id }: { id: string }) {
  const router = useRouter();
  const [d, setD] = useState<Resp | null>(null);
  const [mode, setMode] = useState<"accept" | "reject" | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      api<Resp>(`/api/handoffs/${id}`).then((r) => {
        if (r.handoff.state === "DRAFT" && r.permissions.manage) router.replace(`/cases/${r.handoff.caseId}/handoff`);
        else setD(r);
      }),
    [id, router],
  );

  useEffect(() => {
    api<Resp>(`/api/handoffs/${id}`)
      .then((r) => {
        if (r.handoff.state === "DRAFT" && r.permissions.manage) router.replace(`/cases/${r.handoff.caseId}/handoff`);
        else setD(r);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load."));
  }, [id, router]);

  if (error && !d) return <ErrorNote error={error} />;
  if (!d) return <PageLoading />;

  const h = d.handoff;
  const s = d.snapshot;
  const from = d.names[h.fromUserId];
  const to = d.names[h.toUserId];

  async function respond() {
    setBusy(true);
    setError(null);
    try {
      if (mode === "accept") await api(`/api/handoffs/${id}/accept`, { method: "POST", json: { note: note || undefined, snapshotHash: h.snapshotHash } });
      else await api(`/api/handoffs/${id}/reject`, { method: "POST", json: { reason: note } });
      setMode(null);
      setNote("");
      if (mode === "accept") router.push(`/cases/${h.caseId}`);
      else await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not respond.");
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    if (!confirm("Withdraw this handoff? You stay the owner.")) return;
    await api(`/api/handoffs/${id}/cancel`, { method: "POST" });
    router.push(`/cases/${h.caseId}`);
  }

  if (!s) {
    return (
      <Card className="p-6 text-sm text-muted">
        This handoff is still a draft with {from}. <Link className="text-accent" href={`/cases/${h.caseId}`}>Open the case</Link>
      </Card>
    );
  }

  const openActions = s.actions.filter((a) => a.status !== "DONE").sort((a, b) => (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9"));
  const context = [...s.context].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  const live = s.decisions.filter((x) => !s.decisions.some((y) => y.supersedesId === x.id));

  return (
    <div className="space-y-6">
      <div>
        <nav className="flex items-center gap-1.5 text-[13px] text-muted" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-ink">
            Cases
          </Link>
          <ChevronRight size={14} aria-hidden />
          <Link href={`/cases/${h.caseId}`} className="truncate hover:text-ink">
            {d.case.title}
          </Link>
          <ChevronRight size={14} aria-hidden />
          <span className="text-ink-2">Context package</span>
        </nav>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.015em]">Context package</h1>
          <Badge tone={STATE_TONE[h.state]} dot>
            {label(h.state)}
          </Badge>
        </div>
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Avatar name={from} size={36} />
            <div>
              <div className="text-xs text-muted">From</div>
              <div className="font-medium">{from}</div>
            </div>
          </div>
          <span className="text-xl text-muted">→</span>
          <div className="flex items-center gap-2">
            <Avatar name={to} size={36} />
            <div>
              <div className="text-xs text-muted">To</div>
              <div className="font-medium">{to}</div>
            </div>
          </div>
          <div className="ml-auto text-right text-sm">
            <div className="text-muted">Submitted {fmtDateTime(h.submittedAt)}</div>
            <div>Readiness at submission: <span className="font-semibold">{h.readinessScore}%</span></div>
          </div>
        </div>
        <p className="mt-4 rounded-lg bg-surface-2 px-3 py-2 text-sm">“{h.reason}”</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <Mono>package sha256 {shortHash(h.snapshotHash)}</Mono>
          {d.snapshotIntact ? <Badge tone="good">Package intact</Badge> : <Badge tone="bad">Package altered since submission</Badge>}
        </div>
      </Card>

      {d.permissions.respond && (
        <Card className="flex flex-wrap items-center gap-3 border-accent/40 bg-accent-soft/50 p-4">
          <p className="min-w-0 flex-1 text-sm">
            Accepting makes you the accountable owner, and records that you received <span className="font-medium">exactly this package</span>.
          </p>
          <Button variant="secondary" onClick={() => setMode("reject")}>
            Return to {from.split(" ")[0]}
          </Button>
          <Button variant="primary" onClick={() => setMode("accept")}>
            Accept responsibility
          </Button>
        </Card>
      )}
      {h.state === "PENDING_ACCEPT" && !d.permissions.respond && d.permissions.cancel && (
        <Card className="flex items-center gap-3 p-4 text-sm">
          <span className="flex-1">Waiting for {to} to review and accept. You will be notified.</span>
          <Button size="sm" variant="ghost" onClick={withdraw}>
            Withdraw
          </Button>
        </Card>
      )}
      {(h.state === "ACCEPTED" || h.state === "REJECTED") && (
        <Card className={cx("p-4 text-sm", h.state === "ACCEPTED" ? "border-good/30 bg-good-soft/60" : "border-bad/30 bg-bad-soft/60")}>
          <span className="font-semibold">
            {h.state === "ACCEPTED" ? `${to} accepted responsibility` : `${to} returned the case`} {fmtDateTime(h.respondedAt)}.
          </span>
          {h.responseNote && <span> “{h.responseNote}”</span>}
        </Card>
      )}

      {d.updatesSince.length > 0 && (
        <Card className="border-accent/50 p-5">
          <Section title={`Since this package was sent (${d.updatesSince.length})`} hint="The case kept moving after the package was frozen. These are not part of the signed package.">
            <ul className="space-y-2">
              {d.updatesSince.map((u) => (
                <li key={u.id} className="flex flex-wrap items-start gap-2 text-sm">
                  <Badge tone={u.kind === "ESCALATION" ? "bad" : u.kind === "EVENT" ? "accent" : "neutral"}>{label(u.kind)}</Badge>
                  <span className="min-w-0 flex-1">{u.body}</span>
                  <span className="text-xs text-muted">
                    {d.names[u.authorId]} · {fmtDateTime(u.occurredAt)}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        </Card>
      )}

      {s.waivers.length > 0 && (
        <Card className="border-warn/40 p-5">
          <Section title="Known gaps, disclosed by the sender" hint="These checks did not pass. The sender chose to hand off anyway and said why.">
            <ul className="space-y-2">
              {s.waivers.map((w) => (
                <li key={w.code} className="rounded-lg bg-warn-soft/60 px-3 py-2 text-sm">
                  <code className="font-mono text-xs text-warn">{w.code}</code>
                  <div className="mt-0.5">“{w.justification}”</div>
                  <div className="text-xs text-muted">— {w.by}</div>
                </li>
              ))}
            </ul>
          </Section>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <Card className="p-5">
            <Section title="What you need to know">
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{s.case.summary}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                <Badge>{label(s.case.caseType)}</Badge>
                <Badge tone={s.case.priority === "CRITICAL" ? "bad" : s.case.priority === "HIGH" ? "warn" : "neutral"}>{label(s.case.priority)} priority</Badge>
                {s.case.deadline && <Badge tone="accent">Deadline {fmtDate(s.case.deadline, { day: "numeric", month: "short" })} · {relDays(s.case.deadline)}</Badge>}
              </div>
            </Section>
          </Card>

          <Card className="p-5">
            <Section title="Pending actions" hint="What you are picking up, soonest first.">
              {openActions.length === 0 ? (
                <p className="text-sm text-muted">Nothing open.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {openActions.map((a) => {
                    const overdue = a.dueDate && new Date(a.dueDate) < new Date();
                    return (
                      <li key={a.id} className="py-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={a.status === "BLOCKED" ? "bad" : a.status === "IN_PROGRESS" ? "accent" : "neutral"}>{label(a.status)}</Badge>
                          <span className="font-medium">{a.title}</span>
                          <span className={cx("ml-auto text-sm", overdue ? "text-bad" : "text-muted")}>
                            {a.dueDate ? `${fmtDate(a.dueDate, { day: "numeric", month: "short" })} · ${relDays(a.dueDate)}` : "No due date"}
                          </span>
                        </div>
                        <div className="mt-1 text-sm text-muted">
                          {a.assignee ? `Assigned to ${a.assignee}` : "Unassigned"}
                          {a.blockedReason && <span className="text-bad"> · Blocked: {a.blockedReason}</span>}
                        </div>
                        {a.note && <div className="mt-1 text-sm">{a.note}</div>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>
          </Card>

          <Card className="p-5">
            <Section title="Decisions already made" hint="Settled. Revisit only with the rationale in front of you.">
              <ul className="space-y-3">
                {live.map((x) => (
                  <li key={x.id} className="text-sm">
                    <div className="font-medium">{x.title}</div>
                    <div className="mt-0.5">{x.rationale}</div>
                    <div className="text-xs text-muted">
                      {x.decidedBy} · {fmtDate(x.decidedAt)}
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          </Card>
        </div>

        <div className="space-y-6">
          {s.updates && s.updates.length > 0 && (
            <Card className="p-5">
              <Section title="Latest on the case" hint="The running log, newest first.">
                <ul className="space-y-2.5">
                  {s.updates.slice(0, 6).map((u) => (
                    <li key={u.id} className="text-sm">
                      <div className="flex items-center gap-2">
                        <Badge tone={u.kind === "ESCALATION" ? "bad" : u.kind === "EVENT" ? "accent" : "neutral"}>{label(u.kind)}</Badge>
                        <span className="text-xs text-muted">
                          {u.author} · {fmtDateTime(u.occurredAt)}
                        </span>
                      </div>
                      <p className="mt-1">{u.body}</p>
                    </li>
                  ))}
                </ul>
              </Section>
            </Card>
          )}
          <Card className="p-5">
            <Section title="Context">
              <ul className="space-y-3">
                {context.map((c) => (
                  <li key={c.id} className="text-sm">
                    <div className="flex items-center gap-2">
                      <Badge tone={c.kind === "RISK" ? "bad" : c.kind === "CONSTRAINT" || c.kind === "OPEN_QUESTION" ? "warn" : "neutral"}>{label(c.kind)}</Badge>
                      <span className="font-medium">{c.title}</span>
                    </div>
                    {c.body && <p className="mt-1 text-ink/90">{c.body}</p>}
                    {c.resolution && <p className="mt-1 text-good">Answer: {c.resolution}</p>}
                  </li>
                ))}
              </ul>
            </Section>
          </Card>
          <Card className="p-5">
            <Section title="Documents" hint="Fingerprints recorded in this package.">
              <ul className="space-y-2">
                {s.documents.map((doc) => (
                  <li key={doc.id} className="text-sm">
                    <a href={`/api/documents/${doc.id}/download`} className="font-medium text-accent hover:underline">
                      {doc.filename}
                    </a>{" "}
                    <Badge>{label(doc.docClass)}</Badge>
                    <Mono className="block">{shortHash(doc.sha256)}</Mono>
                  </li>
                ))}
              </ul>
            </Section>
          </Card>
        </div>
      </div>

      <Modal open={mode !== null} onClose={() => setMode(null)} title={mode === "accept" ? "Accept responsibility" : `Return the case to ${from}`}>
        <div className="space-y-4">
          {mode === "accept" ? (
            <p className="text-sm text-muted">
              You acknowledge package <Mono>{shortHash(h.snapshotHash)}</Mono>, including {s.waivers.length} disclosed gap{s.waivers.length === 1 ? "" : "s"}. This is
              recorded in the case&apos;s tamper-evident history.
            </p>
          ) : (
            <p className="text-sm text-muted">{from} stays the owner and is told what is missing.</p>
          )}
          <Field label={mode === "accept" ? "Note (optional)" : "What is missing?"}>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <ErrorNote error={error} />
          <div className="flex justify-end gap-2">
            <Button onClick={() => setMode(null)}>Cancel</Button>
            <Button variant={mode === "accept" ? "primary" : "danger"} loading={busy} disabled={mode === "reject" && note.trim().length < 10} onClick={respond}>
              {mode === "accept" ? "Accept and take ownership" : "Return case"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
