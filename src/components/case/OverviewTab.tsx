"use client";

import { useState } from "react";
import { api, ApiError, fmtDate, fromDateInput, relDays, toDateInput } from "@/lib/client";
import { PRIORITIES, REQUIRED_DOCS, label } from "@/lib/domain";
import { FindingList } from "../FindingList";
import { Button, Card, ErrorNote, Field, Gauge, Input, Select, Textarea } from "../ui";
import type { TabProps } from "./types";

export function OverviewTab({ data, reload, focus }: TabProps) {
  const c = data.case;
  const r = data.readiness;
  const [editing, setEditing] = useState(focus === "summary" || focus === "deadline");
  const [form, setForm] = useState({ summary: c.summary, priority: c.priority, deadline: toDateInput(c.deadline) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/cases/${c.id}`, { method: "PATCH", json: { summary: form.summary, priority: form.priority, deadline: fromDateInput(form.deadline) } });
      await reload();
      setEditing(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  const openActions = c.actions.filter((a) => a.status !== "DONE");
  const required = REQUIRED_DOCS[c.caseType] ?? [];
  const blockerRules = new Set(r.blockers.map((b) => b.code)).size;
  const warningRules = new Set(r.warnings.filter((w) => !w.waived).map((w) => w.code)).size;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Summary</h2>
            {data.permissions.edit && !editing && (
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
          </div>
          {editing ? (
            <div className="space-y-4">
              <div id="focus-summary" className="rounded-lg">
                <Field label="Summary" hint={`${form.summary.trim().length} characters · the gate asks for at least 120.`}>
                  <Textarea rows={6} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
                </Field>
              </div>
              <div id="focus-deadline" className="grid gap-4 rounded-lg sm:grid-cols-2">
                <Field label="Deadline">
                  <Input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
                </Field>
                <Field label="Priority">
                  <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {label(p)}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <ErrorNote error={error} />
              <div className="flex justify-end gap-2">
                <Button onClick={() => setEditing(false)}>Cancel</Button>
                <Button variant="primary" onClick={save} loading={busy}>
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{c.summary || <span className="text-muted">No summary yet.</span>}</p>
          )}
        </Card>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Open actions", openActions.length],
            ["Decisions", c.decisions.length],
            ["Context items", c.contextItems.length],
            ["Documents", c.documents.length],
          ].map(([k, v]) => (
            <Card key={k} className="p-4">
              <div className="text-xs text-muted">{k}</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">{v}</div>
            </Card>
          ))}
        </div>

        <Card className="p-5">
          <h2 className="mb-3 font-semibold">Case facts</h2>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted">Deadline</dt>
              <dd>
                {fmtDate(c.deadline)} {c.deadline && <span className="text-muted">({relDays(c.deadline)})</span>}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Opened</dt>
              <dd>{fmtDate(c.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-muted">Team</dt>
              <dd>{c.team}</dd>
            </div>
            <div>
              <dt className="text-muted">Required documents</dt>
              <dd>{required.length ? required.map((d) => label(d)).join(", ") : "None for this case type"}</dd>
            </div>
          </dl>
        </Card>
      </div>

      {c.status !== "CLOSED" && (
        <Card className="h-fit p-5">
          <h2 className="font-semibold">Handoff readiness</h2>
          <p className="mb-3 text-sm text-muted">Could this case change hands right now?</p>
          <div className="flex items-center gap-4">
            <Gauge score={r.score} blockers={r.blockers.length} size={110} />
            <div className="space-y-1 text-sm">
              <div className={blockerRules ? "font-medium text-bad" : "text-good"}>{blockerRules ? `${blockerRules} blocker${blockerRules > 1 ? "s" : ""}` : "No blockers"}</div>
              <div className={warningRules ? "text-warn" : "text-muted"}>
                {warningRules} warning{warningRules === 1 ? "" : "s"}
              </div>
            </div>
          </div>
          <div className="mt-4">
            {r.blockers.length + r.warnings.length === 0 ? (
              <p className="rounded-lg bg-good-soft px-3 py-2 text-sm text-good">Every check passes. This case is ready to hand off.</p>
            ) : (
              <FindingList findings={[...r.blockers, ...r.warnings]} />
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
