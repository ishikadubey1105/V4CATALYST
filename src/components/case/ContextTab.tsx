"use client";

import { useState } from "react";
import { api, ApiError, fmtDate } from "@/lib/client";
import { CONTEXT_KINDS, label } from "@/lib/domain";
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, Select, Textarea, cx } from "../ui";
import type { ContextItem, TabProps } from "./types";

const KIND_TONE: Record<string, "neutral" | "accent" | "warn" | "bad"> = {
  BACKGROUND: "neutral",
  STAKEHOLDER: "accent",
  CONSTRAINT: "warn",
  OPEN_QUESTION: "warn",
  RISK: "bad",
};

function AddForm({ caseId, onDone }: { caseId: string; onDone: () => Promise<void> }) {
  const [form, setForm] = useState({ kind: "BACKGROUND", title: "", body: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function add() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/cases/${caseId}/context`, { method: "POST", json: form });
      setForm({ kind: form.kind, title: "", body: "" });
      await onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not add.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card id="focus-new" className="space-y-3 p-4">
      <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
        <Field label="Kind">
          <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            {CONTEXT_KINDS.map((k) => (
              <option key={k} value={k}>
                {label(k)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Title">
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="What the next owner needs to know" />
        </Field>
      </div>
      <Field label="Detail">
        <Textarea rows={3} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
      </Field>
      <ErrorNote error={error} />
      <div className="flex justify-end">
        <Button variant="primary" onClick={add} loading={busy} disabled={form.title.trim().length < 2}>
          Add to context
        </Button>
      </div>
    </Card>
  );
}

function Item({ item, data, reload, focused }: { item: ContextItem; data: TabProps["data"]; reload: () => Promise<void>; focused: boolean }) {
  const [resolving, setResolving] = useState(focused && item.kind === "OPEN_QUESTION" && !item.resolvedAt);
  const [resolution, setResolution] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editable = data.permissions.edit;

  async function patch(json: object) {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/context/${item.id}`, { method: "PATCH", json });
      await reload();
      setResolving(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Remove this context item? The removal and its content are kept in the audit trail.")) return;
    await api(`/api/context/${item.id}`, { method: "DELETE" });
    await reload();
  }

  const unanswered = item.kind === "OPEN_QUESTION" && !item.resolvedAt;
  return (
    <Card id={`focus-${item.id}`} className={cx("p-4", unanswered && "border-warn/40")}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={KIND_TONE[item.kind]}>{label(item.kind)}</Badge>
        <span className="font-medium">{item.title}</span>
        {unanswered && <Badge tone="warn">Unanswered</Badge>}
        <span className="ml-auto text-xs text-muted">
          {data.names[item.authorId]} · {fmtDate(item.createdAt)}
        </span>
      </div>
      {item.body && <p className="mt-2 whitespace-pre-wrap text-sm text-ink/90">{item.body}</p>}
      {item.resolution && (
        <div className="mt-3 rounded-lg bg-good-soft px-3 py-2 text-sm">
          <span className="font-medium text-good">Resolved {fmtDate(item.resolvedAt)}:</span> {item.resolution}
        </div>
      )}
      {resolving ? (
        <div className="mt-3 space-y-2">
          <Textarea rows={2} value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="What is the answer, and who confirmed it?" />
          <ErrorNote error={error} />
          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={() => setResolving(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" loading={busy} disabled={resolution.trim().length < 3} onClick={() => patch({ resolution })}>
              Record resolution
            </Button>
          </div>
        </div>
      ) : (
        editable && (
          <div className="mt-2 flex justify-end gap-1">
            {unanswered && (
              <Button size="sm" variant="secondary" onClick={() => setResolving(true)}>
                Resolve
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={remove}>
              Remove
            </Button>
          </div>
        )
      )}
    </Card>
  );
}

export function ContextTab({ data, reload, focus }: TabProps) {
  const [adding, setAdding] = useState(focus === "new");
  const items = data.case.contextItems;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">Background, stakeholders, constraints, risks and open questions — what lives in the owner&apos;s head.</p>
        {data.permissions.edit && !adding && (
          <Button variant="primary" size="sm" onClick={() => setAdding(true)}>
            Add context
          </Button>
        )}
      </div>
      {adding && data.permissions.edit && <AddForm caseId={data.case.id} onDone={reload} />}
      {items.length === 0 && !adding && <Empty title="No context recorded yet.">The receiver will start from zero.</Empty>}
      {items.map((i) => (
        <Item key={i.id} item={i} data={data} reload={reload} focused={focus === i.id} />
      ))}
    </div>
  );
}
