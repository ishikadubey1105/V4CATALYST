"use client";

import { useState } from "react";
import { api, ApiError, fmtDate } from "@/lib/client";
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, Select, Textarea, cx } from "../ui";
import type { Decision, TabProps } from "./types";

function DocSelect({ docs, value, onChange }: { docs: TabProps["data"]["case"]["documents"]; value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">No linked document</option>
      {docs.map((d) => (
        <option key={d.id} value={d.id}>
          {d.filename}
        </option>
      ))}
    </Select>
  );
}

function DecisionCard({ d, data, reload, focused }: { d: Decision; data: TabProps["data"]; reload: () => Promise<void>; focused: boolean }) {
  const missing = !d.rationale.trim();
  const [editing, setEditing] = useState(focused);
  const [rationale, setRationale] = useState(d.rationale);
  const [doc, setDoc] = useState(d.refDocumentId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const superseded = data.case.decisions.find((x) => x.supersedesId === d.id);
  const linked = data.case.documents.find((x) => x.id === d.refDocumentId);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/decisions/${d.id}`, { method: "PATCH", json: { rationale, refDocumentId: doc || null } });
      await reload();
      setEditing(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card id={`focus-${d.id}`} className={cx("p-4", missing && "border-bad/40", superseded && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{d.title}</span>
        {missing && <Badge tone="bad">No rationale</Badge>}
        {superseded && <Badge>Superseded</Badge>}
        <span className="ml-auto text-xs text-muted">
          {data.names[d.decidedById]} · {fmtDate(d.decidedAt)}
        </span>
      </div>
      {editing ? (
        <div className="mt-3 space-y-3">
          <Field label="Why was this decided?" hint="Someone revisiting this in three months should be able to defend or overturn it.">
            <Textarea rows={3} value={rationale} onChange={(e) => setRationale(e.target.value)} />
          </Field>
          <Field label="Supporting document">
            <DocSelect docs={data.case.documents} value={doc} onChange={setDoc} />
          </Field>
          <ErrorNote error={error} />
          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" loading={busy} onClick={save} disabled={rationale.trim().length < 10}>
              Save rationale
            </Button>
          </div>
        </div>
      ) : (
        <>
          {d.rationale ? (
            <p className="mt-2 text-sm">
              <span className="text-muted">Rationale: </span>
              {d.rationale}
            </p>
          ) : (
            <p className="mt-2 text-sm text-bad">No one recorded why. This blocks a handoff.</p>
          )}
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs text-muted">{linked ? `Supported by ${linked.filename}` : ""}</span>
            {data.permissions.edit && (
              <Button size="sm" variant={missing ? "primary" : "ghost"} onClick={() => setEditing(true)}>
                {missing ? "Add rationale" : "Edit"}
              </Button>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

export function DecisionsTab({ data, reload, focus }: TabProps) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: "", rationale: "", refDocumentId: "", supersedesId: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/cases/${data.case.id}/decisions`, {
        method: "POST",
        json: { ...form, refDocumentId: form.refDocumentId || null, supersedesId: form.supersedesId || null },
      });
      setForm({ title: "", rationale: "", refDocumentId: "", supersedesId: "" });
      setAdding(false);
      await reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not record.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">What was decided, by whom, and why. A decision without a reason cannot be revisited.</p>
        {data.permissions.edit && !adding && (
          <Button variant="primary" size="sm" onClick={() => setAdding(true)}>
            Record decision
          </Button>
        )}
      </div>
      {adding && (
        <Card className="space-y-3 p-4">
          <Field label="Decision">
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label="Rationale" hint="Required. At least 10 characters.">
            <Textarea rows={3} value={form.rationale} onChange={(e) => setForm({ ...form, rationale: e.target.value })} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Supporting document">
              <DocSelect docs={data.case.documents} value={form.refDocumentId} onChange={(v) => setForm({ ...form, refDocumentId: v })} />
            </Field>
            <Field label="Supersedes">
              <Select value={form.supersedesId} onChange={(e) => setForm({ ...form, supersedesId: e.target.value })}>
                <option value="">Nothing</option>
                {data.case.decisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <ErrorNote error={error} />
          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" loading={busy} onClick={add} disabled={!form.title.trim() || form.rationale.trim().length < 10}>
              Record
            </Button>
          </div>
        </Card>
      )}
      {data.case.decisions.length === 0 && !adding && <Empty title="No decisions recorded." />}
      {data.case.decisions.map((d) => (
        <DecisionCard key={d.id} d={d} data={data} reload={reload} focused={focus === d.id} />
      ))}
    </div>
  );
}
