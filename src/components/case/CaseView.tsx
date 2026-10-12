"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  Archive,
  ArrowRightLeft,
  BookOpenText,
  ChevronRight,
  History,
  LayoutDashboard,
  ListChecks,
  MessageSquareText,
  Paperclip,
  Scale,
  UserCog,
  Users,
} from "lucide-react";
import { api, ApiError } from "@/lib/client";
import { label } from "@/lib/domain";
import { useMe } from "../AppShell";
import { Avatar, Badge, Button, ButtonLink, ErrorNote, Field, Modal, PageLoading, Select, Textarea, cx } from "../ui";
import { ActionsTab } from "./ActionsTab";
import { ActivityTab } from "./ActivityTab";
import { ContextTab } from "./ContextTab";
import { DecisionsTab } from "./DecisionsTab";
import { DocumentsTab } from "./DocumentsTab";
import { OverviewTab } from "./OverviewTab";
import { OwnershipTab } from "./OwnershipTab";
import { UpdatesTab } from "./UpdatesTab";
import type { CaseData } from "./types";
import { useFocusTarget } from "./useFocus";

const TABS = [
  ["overview", "Overview", LayoutDashboard],
  ["updates", "Updates", MessageSquareText],
  ["context", "Context", BookOpenText],
  ["decisions", "Decisions", Scale],
  ["actions", "Actions", ListChecks],
  ["documents", "Documents", Paperclip],
  ["activity", "Activity", History],
  ["ownership", "Ownership", Users],
] as const;
type Tab = (typeof TABS)[number][0];

function ReassignModal({ data, open, onClose, onDone }: { data: CaseData; open: boolean; onClose: () => void; onDone: () => void }) {
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [toUserId, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) api<{ users: { id: string; name: string }[] }>("/api/users").then((r) => setUsers(r.users.filter((u) => u.id !== data.case.currentOwnerId)));
  }, [open, data.case.currentOwnerId]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/cases/${data.case.id}/reassign`, { method: "POST", json: { toUserId, reason } });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not reassign.");
    } finally {
      setBusy(false);
    }
  }

  const blockers = new Set(data.readiness.blockers.map((b) => b.code)).size;
  return (
    <Modal open={open} onClose={onClose} title="Reassign without a handoff">
      <div className="space-y-4">
        <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
          This bypasses the readiness gate. It is recorded permanently with your name, your reason, and the case&apos;s readiness right now ({data.readiness.score}%
          {blockers ? `, ${blockers} blocker${blockers > 1 ? "s" : ""}` : ""}).
        </p>
        <Field label="New owner">
          <Select value={toUserId} onChange={(e) => setTo(e.target.value)}>
            <option value="">Choose…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Why the gate is being skipped">
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Owner is unreachable on emergency leave." />
        </Field>
        <ErrorNote error={error} />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={submit} loading={busy} disabled={!toUserId || reason.trim().length < 10}>
            Reassign and record bypass
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function CaseView({ id, tab: initialTab, focus }: { id: string; tab: string | null; focus: string | null }) {
  const me = useMe();
  const router = useRouter();
  const [data, setData] = useState<CaseData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reassigning, setReassigning] = useState(false);
  const tab: Tab = TABS.some(([t]) => t === initialTab) ? (initialTab as Tab) : "overview";

  const reload = useCallback(async () => {
    try {
      setData(await api<CaseData>(`/api/cases/${id}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load the case.");
    }
  }, [id]);

  useEffect(() => {
    api<CaseData>(`/api/cases/${id}`)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load the case."));
  }, [id]);

  useFocusTarget(focus, Boolean(data));

  if (error) return <ErrorNote error={error} />;
  if (!data) return <PageLoading />;

  const c = data.case;
  const r = data.readiness;
  const ah = data.activeHandoff;
  const blockerRules = new Set(r.blockers.map((b) => b.code)).size;

  async function close() {
    if (!confirm("Close this case? It will become read-only.")) return;
    try {
      await api(`/api/cases/${id}/close`, { method: "POST" });
      reload();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Could not close.");
    }
  }

  const props = { data, reload, focus };

  return (
    <div className="space-y-6">
      <div>
        <nav className="flex items-center gap-1.5 text-[13px] text-muted" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-ink">
            Cases
          </Link>
          <ChevronRight size={14} aria-hidden />
          <span className="truncate text-ink-2">{c.title}</span>
        </nav>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.015em]">{c.title}</h1>
            <div className="mt-2.5 flex flex-wrap items-center gap-2 text-sm">
              <Badge>{label(c.caseType)}</Badge>
              <Badge tone={c.priority === "CRITICAL" ? "bad" : c.priority === "HIGH" ? "warn" : "neutral"} dot={c.priority === "HIGH" || c.priority === "CRITICAL"}>
                {label(c.priority)} priority
              </Badge>
              <Badge tone={c.status === "IN_HANDOFF" ? "accent" : c.status === "CLOSED" ? "neutral" : "good"} dot>
                {label(c.status)}
              </Badge>
              <span className="mx-1 h-4 w-px bg-line-strong" aria-hidden />
              <span className="flex items-center gap-2 text-muted">
                <Avatar name={c.currentOwner.name} size={22} />
                <span>
                  <span className="text-ink">{c.currentOwner.name}</span> owns this case
                </span>
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.permissions.edit && (
              <Button onClick={close} variant="ghost" icon={Archive}>
                Close
              </Button>
            )}
            {data.permissions.reassign && (
              <Button onClick={() => setReassigning(true)} variant="secondary" icon={UserCog}>
                Reassign
              </Button>
            )}
            {data.permissions.handoff && c.status === "ACTIVE" && (
              <ButtonLink href={`/cases/${id}/handoff`} variant="primary" icon={ArrowRightLeft}>
                {ah?.state === "DRAFT" ? "Continue handoff" : "Hand off case"}
              </ButtonLink>
            )}
          </div>
        </div>
      </div>

      {ah?.state === "DRAFT" && (
        <div className="sticky top-[72px] z-10 flex flex-wrap items-center gap-3 rounded-xl border border-accent/30 bg-surface px-4 py-3 shadow-md">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <ArrowRightLeft size={16} aria-hidden />
          </span>
          <span className="text-sm">
            Handing off to <span className="font-semibold">{data.names[ah.toUserId]}</span>
          </span>
          <Badge tone={blockerRules ? "bad" : "good"} dot>
            {r.score}% ready
          </Badge>
          <span className="text-sm text-muted">{blockerRules ? `${blockerRules} blocker${blockerRules > 1 ? "s" : ""} left` : "No blockers. Ready to submit."}</span>
          <ButtonLink href={`/cases/${id}/handoff`} variant="primary" size="sm" className="ml-auto">
            Back to handoff
          </ButtonLink>
        </div>
      )}
      {ah?.state === "PENDING_ACCEPT" && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-accent/30 bg-accent-soft px-4 py-3">
          <span className="text-sm text-ink">
            {ah.toUserId === me.id ? (
              <>This case is being handed to you. Review the context package before you accept responsibility.</>
            ) : (
              <>
                Awaiting acceptance by <span className="font-semibold">{data.names[ah.toUserId]}</span>. Case contents are locked until they respond; the case log stays open.
              </>
            )}
          </span>
          <ButtonLink href={`/handoffs/${ah.id}`} variant="primary" size="sm" className="ml-auto">
            {ah.toUserId === me.id ? "Review package" : "View package"}
          </ButtonLink>
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto border-b border-line" role="tablist" aria-label="Case sections">
        {TABS.map(([t, name, Icon]) => {
          const count =
            t === "updates" ? c.updates.length : t === "context" ? c.contextItems.length : t === "decisions" ? c.decisions.length : t === "actions" ? c.actions.filter((a) => a.status !== "DONE").length : t === "documents" ? c.documents.length : null;
          const flagged = [...r.blockers, ...r.warnings].some((f) => !f.waived && f.fixPath.includes(`tab=${t}`));
          return (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => router.replace(`/cases/${id}?tab=${t}`, { scroll: false })}
              className={cx(
                "relative -mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors",
                tab === t ? "border-accent font-medium text-ink" : "border-transparent text-muted hover:text-ink",
              )}
            >
              <Icon size={15} aria-hidden className={tab === t ? "text-accent" : ""} />
              {name}
              {count !== null && <span className="rounded-full bg-surface-3 px-1.5 text-[11px] font-medium tabular-nums text-ink-2">{count}</span>}
              {flagged && c.status !== "CLOSED" && <span className="h-1.5 w-1.5 rounded-full bg-bad" aria-label="has findings" />}
            </button>
          );
        })}
      </div>

      {/* Remount on tab or focus change so a finding link opens its editor fresh. */}
      <div key={`${tab}:${focus ?? ""}`}>
        {tab === "overview" && <OverviewTab {...props} />}
        {tab === "updates" && <UpdatesTab {...props} />}
        {tab === "context" && <ContextTab {...props} />}
        {tab === "decisions" && <DecisionsTab {...props} />}
        {tab === "actions" && <ActionsTab {...props} />}
        {tab === "documents" && <DocumentsTab {...props} />}
        {tab === "activity" && <ActivityTab {...props} />}
        {tab === "ownership" && <OwnershipTab {...props} />}
      </div>

      <ReassignModal
        data={data}
        open={reassigning}
        onClose={() => setReassigning(false)}
        onDone={() => {
          setReassigning(false);
          reload();
        }}
      />
    </div>
  );
}
