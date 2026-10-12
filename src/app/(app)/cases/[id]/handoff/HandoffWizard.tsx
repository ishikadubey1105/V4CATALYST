"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, ChevronRight, Lock, OctagonX, RefreshCw, Send, ShieldCheck } from "lucide-react";
import { api, ApiError } from "@/lib/client";
import type { Readiness } from "@/lib/gate";
import { FindingList } from "@/components/FindingList";
import { Avatar, Button, Card, ErrorNote, Field, Gauge, PageLoading, Select, Textarea, cx } from "@/components/ui";

type CaseResp = {
  case: { id: string; title: string; status: string; currentOwnerId: string; currentOwner: { name: string } };
  activeHandoff: { id: string; state: string; toUserId: string } | null;
  names: Record<string, string>;
  permissions: { handoff: boolean };
};
type Waiver = { code: string; justification: string; userId: string; at: string };
type HandoffResp = {
  handoff: { id: string; state: string; toUserId: string; fromUserId: string; reason: string };
  readiness: Readiness;
  waivers: Waiver[];
  names: Record<string, string>;
  permissions: { manage: boolean; cancel: boolean };
};

function StartForm({ c, onStarted, initial }: { c: CaseResp; onStarted: (id: string) => void; initial?: { toUserId: string; reason: string } }) {
  const [users, setUsers] = useState<{ id: string; name: string; title: string | null }[]>([]);
  const [toUserId, setTo] = useState(initial?.toUserId ?? "");
  const [reason, setReason] = useState(initial?.reason ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ users: { id: string; name: string; title: string | null }[] }>("/api/users").then((r) => setUsers(r.users.filter((u) => u.id !== c.case.currentOwnerId)));
  }, [c.case.currentOwnerId]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ handoff: { id: string } }>(`/api/cases/${c.case.id}/handoffs`, { method: "POST", json: { toUserId, reason } });
      onStarted(r.handoff.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not start the handoff.");
      setBusy(false);
    }
  }

  return (
    <Card className="mx-auto max-w-xl p-6">
      <h2 className="text-lg font-semibold">Who takes this case?</h2>
      <p className="mb-5 text-sm text-muted">Relay will check the case before responsibility moves. You can fix what it finds before submitting.</p>
      <div className="space-y-4">
        <Field label="Recipient">
          <Select value={toUserId} onChange={(e) => setTo(e.target.value)}>
            <option value="">Choose a colleague…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
                {u.title ? ` — ${u.title}` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Why is it changing hands?">
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. On medical leave from tomorrow for three weeks." />
        </Field>
        <ErrorNote error={error} />
        <Button variant="primary" className="w-full" size="lg" onClick={start} loading={busy} disabled={!toUserId || reason.trim().length < 5}>
          Check readiness
        </Button>
      </div>
    </Card>
  );
}

function WaiveControl({ handoffId, code, waiver, editable, onChange }: { handoffId: string; code: string; waiver?: Waiver; editable: boolean; onChange: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(json: object) {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/handoffs/${handoffId}/waive`, { method: "POST", json });
      await onChange();
      setOpen(false);
      setText("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  if (waiver) {
    return (
      <div className="mt-3 rounded-md border border-line bg-surface px-3 py-2 text-sm">
        <span className="text-muted">Disclosed to the receiver: </span>“{waiver.justification}”
        {editable && (
          <button className="ml-2 text-xs text-muted underline hover:text-ink" onClick={() => send({ code, remove: true })}>
            Withdraw
          </button>
        )}
      </div>
    );
  }
  if (!editable) return null;
  if (!open) {
    return (
      <div className="mt-3 flex justify-end">
        <Button size="sm" onClick={() => setOpen(true)}>
          Waive with justification
        </Button>
      </div>
    );
  }
  return (
    <div className="mt-3 space-y-2">
      <Textarea
        autoFocus
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Why is it acceptable to hand off with this gap? The receiver and the auditor will both see this."
      />
      <div className="flex items-center justify-between gap-2">
        <span className={cx("text-xs", text.trim().length < 20 ? "text-muted" : "text-good")}>{text.trim().length}/20 characters minimum</span>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" variant="primary" loading={busy} disabled={text.trim().length < 20} onClick={() => send({ code, justification: text })}>
            Waive and disclose
          </Button>
        </div>
      </div>
      <ErrorNote error={error} />
    </div>
  );
}

export function HandoffWizard({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [c, setC] = useState<CaseResp | null>(null);
  const [h, setH] = useState<HandoffResp | null>(null);
  const [handoffId, setHandoffId] = useState<string | null>(null);
  const [retarget, setRetarget] = useState(false);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHandoff = useCallback(async (hid: string) => {
    setChecking(true);
    try {
      setH(await api<HandoffResp>(`/api/handoffs/${hid}`));
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    api<CaseResp>(`/api/cases/${caseId}`).then((r) => {
      if (r.activeHandoff?.state === "PENDING_ACCEPT") return router.replace(`/handoffs/${r.activeHandoff.id}`);
      setC(r);
      if (r.activeHandoff?.state === "DRAFT") setHandoffId(r.activeHandoff.id);
    });
  }, [caseId, router]);

  useEffect(() => {
    if (handoffId) api<HandoffResp>(`/api/handoffs/${handoffId}`).then(setH);
  }, [handoffId]);

  // Re-run the gate when the owner returns from fixing something in another tab.
  useEffect(() => {
    if (!handoffId) return;
    const onFocus = () => loadHandoff(handoffId);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [handoffId, loadHandoff]);

  if (!c) return <PageLoading />;
  if (!c.permissions.handoff) return <ErrorNote error="You cannot hand off this case." />;

  const header = (step: 1 | 2 | 3) => (
    <div className="mb-7 space-y-5">
      <div>
        <nav className="flex items-center gap-1.5 text-[13px] text-muted" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-ink">
            Cases
          </Link>
          <ChevronRight size={14} aria-hidden />
          <Link href={`/cases/${caseId}`} className="truncate hover:text-ink">
            {c.case.title}
          </Link>
          <ChevronRight size={14} aria-hidden />
          <span className="text-ink-2">Handoff</span>
        </nav>
        <h1 className="mt-3 text-[26px] font-semibold leading-tight tracking-[-0.015em]">Hand off case</h1>
      </div>
      <ol className="flex flex-wrap items-center gap-2 text-sm" aria-label="Progress">
        {["Choose recipient", "Readiness check", "Submit"].map((s, i) => {
          const n = (i + 1) as 1 | 2 | 3;
          const done = n < step;
          const current = n === step;
          return (
            <li key={s} className="flex items-center gap-2">
              <span
                className={cx(
                  "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                  done ? "bg-good text-white" : current ? "bg-accent text-white" : "bg-surface-3 text-muted",
                )}
                aria-current={current ? "step" : undefined}
              >
                {done ? <Check size={13} aria-hidden /> : n}
              </span>
              <span className={cx(current ? "font-medium text-ink" : "text-muted")}>{s}</span>
              {n < 3 && <span className="mx-1 h-px w-8 bg-line-strong" aria-hidden />}
            </li>
          );
        })}
      </ol>
    </div>
  );

  if (!handoffId || retarget) {
    return (
      <div>
        {header(1)}
        <StartForm
          c={c}
          initial={h ? { toUserId: h.handoff.toUserId, reason: h.handoff.reason } : undefined}
          onStarted={(id) => {
            setRetarget(false);
            setHandoffId(id);
            loadHandoff(id);
          }}
        />
      </div>
    );
  }
  if (!h) return <PageLoading />;

  const r = h.readiness;
  const blockerRules = new Set(r.blockers.map((b) => b.code)).size;
  const warningRules = new Set(r.warnings.map((w) => w.code)).size;
  const unwaived = new Set(r.warnings.filter((w) => !w.waived).map((w) => w.code)).size;
  const ready = blockerRules === 0 && unwaived === 0;

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await api(`/api/handoffs/${handoffId}/submit`, { method: "POST" });
      router.push(`/handoffs/${handoffId}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not submit.");
      await loadHandoff(handoffId!);
      setSubmitting(false);
    }
  }

  async function cancel() {
    if (!confirm("Cancel this handoff? You remain the owner.")) return;
    await api(`/api/handoffs/${handoffId}/cancel`, { method: "POST" });
    router.push(`/cases/${caseId}`);
  }

  const recipient = h.names[h.handoff.toUserId];

  return (
    <div>
      {header(ready ? 3 : 2)}
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card className="flex flex-col items-center px-5 pb-4 pt-6 text-center">
            <Gauge score={r.score} blockers={r.blockers.length} size={176} />
            <div
              className={cx(
                "mt-3 flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold",
                blockerRules > 0 ? "bg-bad-soft text-bad" : unwaived > 0 ? "bg-warn-soft text-warn" : "bg-good-soft text-good",
              )}
              role="status"
            >
              {blockerRules > 0 ? <OctagonX size={15} aria-hidden /> : unwaived > 0 ? <AlertTriangle size={15} aria-hidden /> : <ShieldCheck size={15} aria-hidden />}
              {blockerRules > 0
                ? `Handoff refused · ${blockerRules} blocker${blockerRules > 1 ? "s" : ""}`
                : unwaived > 0
                  ? `${unwaived} warning${unwaived > 1 ? "s" : ""} to fix or disclose`
                  : "Ready to hand off"}
            </div>
            <Button size="sm" variant="ghost" icon={RefreshCw} className="mt-3" onClick={() => loadHandoff(handoffId)} loading={checking}>
              Re-check
            </Button>
          </Card>
          <Card className="p-4 text-sm">
            <div className="flex items-center gap-3">
              <Avatar name={c.case.currentOwner.name} size={32} />
              <span className="text-muted">→</span>
              <Avatar name={recipient} size={32} />
              <div>
                <div className="font-medium">{recipient}</div>
                <button className="text-xs text-accent hover:underline" onClick={() => setRetarget(true)}>
                  Change recipient
                </button>
              </div>
            </div>
            <p className="mt-3 text-muted">“{h.handoff.reason}”</p>
          </Card>
          <ErrorNote error={error} />
          <Button variant="primary" size="lg" className="w-full" icon={ready ? Send : Lock} disabled={!ready} loading={submitting} onClick={submit}>
            Submit handoff to {recipient?.split(" ")[0]}
          </Button>
          {!ready && <p className="text-center text-xs text-muted">Submission unlocks when every blocker is fixed and every warning is fixed or disclosed.</p>}
          <button onClick={cancel} className="w-full text-center text-sm text-muted hover:text-ink">
            Cancel handoff
          </button>
        </div>

        <div className="space-y-6">
          <section>
            <h2 className="mb-1 font-semibold">Blockers {blockerRules > 0 && <span className="text-bad">({blockerRules})</span>}</h2>
            <p className="mb-3 text-sm text-muted">These must be fixed. Each one links to the field that resolves it.</p>
            {r.blockers.length === 0 ? (
              <p className="rounded-lg bg-good-soft px-3 py-2 text-sm text-good">No blockers. Nothing critical will be lost in this transfer.</p>
            ) : (
              <FindingList findings={r.blockers} />
            )}
          </section>
          <section>
            <h2 className="mb-1 font-semibold">Warnings {warningRules > 0 && <span className="text-warn">({warningRules})</span>}</h2>
            <p className="mb-3 text-sm text-muted">Fix these, or waive them in writing. A waiver travels with the case: {recipient} and the auditor both see it.</p>
            {r.warnings.length === 0 ? (
              <p className="rounded-lg bg-good-soft px-3 py-2 text-sm text-good">No warnings.</p>
            ) : (
              <FindingList
                findings={r.warnings}
                renderAside={(code) => (
                  <WaiveControl
                    handoffId={handoffId}
                    code={code}
                    waiver={h.waivers.find((w) => w.code === code)}
                    editable={h.permissions.manage}
                    onChange={() => loadHandoff(handoffId)}
                  />
                )}
              />
            )}
          </section>
          <details className="rounded-xl border border-line bg-surface p-4 text-sm">
            <summary className="cursor-pointer font-medium">All {r.rules.length} checks</summary>
            <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
              {r.rules.map((rule) => (
                <li key={rule.code} className="flex items-center gap-2">
                  <span className={!rule.applicable ? "text-muted" : rule.passed ? "text-good" : rule.waived ? "text-muted" : rule.severity === "BLOCKER" ? "text-bad" : "text-warn"}>
                    {!rule.applicable ? "–" : rule.passed ? "✓" : rule.waived ? "◌" : "✕"}
                  </span>
                  <span className={cx(!rule.applicable && "text-muted")}>{rule.label}</span>
                </li>
              ))}
            </ul>
          </details>
        </div>
      </div>
    </div>
  );
}
