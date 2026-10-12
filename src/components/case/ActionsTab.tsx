"use client";

import { useEffect, useState } from "react";
import { api, ApiError, fmtDate, fromDateInput, relDays, toDateInput } from "@/lib/client";
import { ACTION_STATUSES, label } from "@/lib/domain";
import { useMe } from "../AppShell";
import { Avatar, Badge, Button, Card, Empty, ErrorNote, Field, Input, Select, Textarea, cx } from "../ui";
import type { Action, TabProps } from "./types";

type U = { id: string; name: string; role: string };

const STATUS_TONE = { OPEN: "neutral", IN_PROGRESS: "accent", BLOCKED: "bad", DONE: "good" } as const;

type Form = { title: string; status: string; assigneeId: string; dueDate: string; blockedReason: string; note: string; refDocumentId: string };

function toForm(a?: Action): Form {
  return {
    title: a?.title ?? "",
    status: a?.status ?? "OPEN",
    assigneeId: a?.assigneeId ?? "",
    dueDate: toDateInput(a?.dueDate),
    blockedReason: a?.blockedReason ?? "",
    note: a?.note ?? "",
    refDocumentId: a?.refDocumentId ?? "",
  };
}

function ActionForm({ initial, users, docs, onSave, onCancel, busy, error, full }: {
  initial: Form;
  users: U[];
  docs: TabProps["data"]["case"]["documents"];
  onSave: (f: Form) => void;
  onCancel: () => void;
  busy: boolean;
  error: string | null;
  full: boolean;
}) {
  const [f, setF] = useState(initial);
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <div className="space-y-3">
      {full && (
        <Field label="Action">
          <Input value={f.title} onChange={set("title")} />
        </Field>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Status">
          <Select value={f.status} onChange={set("status")}>
            {ACTION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </Select>
        </Field>
        {full && (
          <>
            <Field label="Assignee">
              <Select value={f.assigneeId} onChange={set("assigneeId")}>
                <option value="">Unassigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Due">
              <Input type="date" value={f.dueDate} onChange={set("dueDate")} />
            </Field>
          </>
        )}
      </div>
      {f.status === "BLOCKED" && (
        <Field label="Blocked because" hint="Required. The receiver cannot unblock what they cannot diagnose.">
          <Input value={f.blockedReason} onChange={set("blockedReason")} />
        </Field>
      )}
      <Field label="Latest note" hint="Where this stands right now.">
        <Textarea rows={2} value={f.note} onChange={set("note")} />
      </Field>
      {full && docs.length > 0 && (
        <Field label="Related document">
          <Select value={f.refDocumentId} onChange={set("refDocumentId")}>
            <option value="">None</option>
            {docs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.filename}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <ErrorNote error={error} />
      <div className="flex justify-end gap-2">
        <Button size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" loading={busy} onClick={() => onSave(f)} disabled={full && f.title.trim().length < 2}>
          Save
        </Button>
      </div>
    </div>
  );
}

function payload(f: Form, initial: Form, full: boolean) {
  const out: Record<string, unknown> = {};
  if (full && f.title !== initial.title) out.title = f.title;
  if (f.status !== initial.status) out.status = f.status;
  if (full && f.assigneeId !== initial.assigneeId) out.assigneeId = f.assigneeId || null;
  if (full && f.dueDate !== initial.dueDate) out.dueDate = fromDateInput(f.dueDate);
  if (f.blockedReason !== initial.blockedReason) out.blockedReason = f.blockedReason || null;
  if (f.note !== initial.note) out.note = f.note || null;
  if (full && f.refDocumentId !== initial.refDocumentId) out.refDocumentId = f.refDocumentId || null;
  return out;
}

function ActionRow({ a, data, users, reload, focused }: { a: Action; data: TabProps["data"]; users: U[]; reload: () => Promise<void>; focused: boolean }) {
  const me = useMe();
  const [editing, setEditing] = useState(focused);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const full = data.permissions.edit;
  const canTouch = full || (a.assigneeId === me.id && data.case.status !== "CLOSED");
  const overdue = a.status !== "DONE" && a.dueDate && new Date(a.dueDate) < new Date();
  const ownerHolds = a.status === "IN_PROGRESS" && a.assigneeId === data.case.currentOwnerId && data.activeHandoff?.state === "DRAFT";
  const initial = toForm(a);

  async function save(f: Form) {
    const body = payload(f, initial, full);
    if (Object.keys(body).length === 0) return setEditing(false);
    setBusy(true);
    setError(null);
    try {
      await api(`/api/actions/${a.id}`, { method: "PATCH", json: body });
      await reload();
      setEditing(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card id={`focus-${a.id}`} className={cx("p-4", (overdue || ownerHolds) && "border-bad/40", a.status === "DONE" && "opacity-70")}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONE[a.status as keyof typeof STATUS_TONE]}>{label(a.status)}</Badge>
        <span className={cx("font-medium", a.status === "DONE" && "line-through decoration-muted")}>{a.title}</span>
        {overdue && <Badge tone="bad">Overdue</Badge>}
        <span className="ml-auto flex items-center gap-3 text-sm text-muted">
          {a.dueDate && (
            <span className={cx(overdue && "text-bad")}>
              Due {fmtDate(a.dueDate, { day: "numeric", month: "short" })} · {relDays(a.dueDate)}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            {a.assigneeId ? (
              <>
                <Avatar name={data.names[a.assigneeId]} size={20} />
                {data.names[a.assigneeId]}
              </>
            ) : (
              "Unassigned"
            )}
          </span>
        </span>
      </div>
      {ownerHolds && !editing && <p className="mt-2 text-sm text-bad">In progress with the outgoing owner. Reassign it before the handoff.</p>}
      {editing ? (
        <div className="mt-3">
          <ActionForm initial={initial} users={users} docs={data.case.documents} onSave={save} onCancel={() => setEditing(false)} busy={busy} error={error} full={full} />
        </div>
      ) : (
        <>
          {a.blockedReason && (
            <p className="mt-2 text-sm">
              <span className="text-muted">Blocked: </span>
              {a.blockedReason}
            </p>
          )}
          {a.status === "BLOCKED" && !a.blockedReason && <p className="mt-2 text-sm text-bad">Blocked, with no reason recorded.</p>}
          {a.note && (
            <p className="mt-2 text-sm">
              <span className="text-muted">Note ({a.noteUpdatedAt ? fmtDate(a.noteUpdatedAt, { day: "numeric", month: "short" }) : ""}): </span>
              {a.note}
            </p>
          )}
          {canTouch && (
            <div className="mt-2 flex justify-end">
              <Button size="sm" variant={ownerHolds ? "primary" : "ghost"} onClick={() => setEditing(true)}>
                {ownerHolds ? "Reassign" : "Update"}
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

export function ActionsTab({ data, reload, focus }: TabProps) {
  const [users, setUsers] = useState<U[]>([]);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ users: U[] }>("/api/users").then((r) => setUsers(r.users));
  }, []);

  async function add(f: Form) {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/cases/${data.case.id}/actions`, {
        method: "POST",
        json: {
          title: f.title,
          status: f.status,
          assigneeId: f.assigneeId || null,
          dueDate: fromDateInput(f.dueDate),
          blockedReason: f.blockedReason || null,
          note: f.note || null,
          refDocumentId: f.refDocumentId || null,
        },
      });
      setAdding(false);
      await reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not add.");
    } finally {
      setBusy(false);
    }
  }

  const open = data.case.actions.filter((a) => a.status !== "DONE");
  const done = data.case.actions.filter((a) => a.status === "DONE");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          {open.length} open · {done.length} done
        </p>
        {data.permissions.edit && !adding && (
          <Button variant="primary" size="sm" onClick={() => setAdding(true)}>
            Add action
          </Button>
        )}
      </div>
      {adding && (
        <Card className="p-4">
          <ActionForm initial={toForm()} users={users} docs={data.case.documents} onSave={add} onCancel={() => setAdding(false)} busy={busy} error={error} full />
        </Card>
      )}
      {data.case.actions.length === 0 && !adding && <Empty title="No actions yet." />}
      {[...open, ...done].map((a) => (
        <ActionRow key={a.id} a={a} data={data} users={users} reload={reload} focused={focus === a.id} />
      ))}
    </div>
  );
}
