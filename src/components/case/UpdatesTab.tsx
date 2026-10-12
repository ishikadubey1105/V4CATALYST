"use client";

import { useState } from "react";
import { api, ApiError, fmtDate, timeAgo } from "@/lib/client";
import { UPDATE_KINDS, label } from "@/lib/domain";
import { Avatar, Badge, Button, Card, Empty, ErrorNote, Field, Input, Textarea, cx } from "../ui";
import { RoleBadge } from "../AppShell";
import type { TabProps } from "./types";

const KIND_STYLE: Record<string, { tone: "neutral" | "accent" | "bad"; dot: string; hint: string }> = {
  UPDATE: { tone: "neutral", dot: "bg-muted", hint: "Progress or a status note" },
  EVENT: { tone: "accent", dot: "bg-accent", hint: "Something happened: a call, a reply, a date moved" },
  ESCALATION: { tone: "bad", dot: "bg-bad", hint: "It got worse or went up a level" },
};

// datetime-local wants local wall-clock time without a zone.
function localNow() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function UpdatesTab({ data, reload }: TabProps) {
  const [kind, setKind] = useState<string>("UPDATE");
  const [body, setBody] = useState("");
  const [when, setWhen] = useState(localNow);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const updates = data.case.updates;
  const pendingTo = data.activeHandoff?.state === "PENDING_ACCEPT" ? data.names[data.activeHandoff.toUserId] : null;

  async function post() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/cases/${data.case.id}/updates`, {
        method: "POST",
        json: { kind, body, occurredAt: when ? new Date(when).toISOString() : null },
      });
      setBody("");
      setWhen(localNow());
      await reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not post.");
    } finally {
      setBusy(false);
    }
  }

  // Group by calendar day, newest first.
  const days = new Map<string, typeof updates>();
  for (const u of updates) {
    const k = fmtDate(u.occurredAt);
    days.set(k, [...(days.get(k) ?? []), u]);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="space-y-4">
        {data.permissions.postUpdate && (
          <Card className="space-y-3 p-4">
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Kind of entry">
              {UPDATE_KINDS.map((k) => (
                <button
                  key={k}
                  role="radio"
                  aria-checked={kind === k}
                  onClick={() => setKind(k)}
                  className={cx(
                    "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition",
                    kind === k ? "border-accent bg-accent-soft font-medium text-ink" : "border-line text-muted hover:text-ink",
                  )}
                >
                  <span className={cx("h-2 w-2 rounded-full", KIND_STYLE[k].dot)} />
                  {label(k)}
                </button>
              ))}
            </div>
            <Textarea
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={
                kind === "EVENT"
                  ? "e.g. Acme's CFO office moved the board meeting to the 18th."
                  : kind === "ESCALATION"
                    ? "e.g. Acme's CEO emailed our VP Sales directly about the dispute."
                    : "e.g. Finance controller confirmed sign-off by Friday."
              }
            />
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="w-56">
                <Field label="When it happened">
                  <Input type="datetime-local" value={when} max={localNow()} onChange={(e) => setWhen(e.target.value)} />
                </Field>
              </div>
              <Button variant="primary" onClick={post} loading={busy} disabled={body.trim().length < 3}>
                Post to case log
              </Button>
            </div>
            <ErrorNote error={error} />
            <p className="text-xs text-muted">
              Everyone on this case sees it{pendingTo ? `, including ${pendingTo}, who is reviewing the handoff` : ""}. It is also written into the tamper-evident history.
            </p>
          </Card>
        )}

        {updates.length === 0 ? (
          <Empty title="Nothing posted yet.">Post what happens on this case as it happens, so whoever holds it next can see the story.</Empty>
        ) : (
          [...days.entries()].map(([day, items]) => (
            <div key={day}>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{day}</div>
              <ol className="relative space-y-3 border-l border-line pl-5">
                {items.map((u) => {
                  const s = KIND_STYLE[u.kind] ?? KIND_STYLE.UPDATE;
                  const late = new Date(u.createdAt).getTime() - new Date(u.occurredAt).getTime() > 60 * 60 * 1000;
                  return (
                    <li key={u.id} className="relative">
                      <span className={cx("absolute -left-[25px] top-4 h-2.5 w-2.5 rounded-full ring-4 ring-bg", s.dot)} />
                      <Card className={cx("p-3", u.kind === "ESCALATION" && "border-bad/40")}>
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <Badge tone={s.tone}>{label(u.kind)}</Badge>
                          <Avatar name={data.names[u.authorId]} size={20} />
                          <span className="font-medium">{data.names[u.authorId]}</span>
                          {data.roles[u.authorId] && <RoleBadge role={data.roles[u.authorId]} />}
                          <span className="ml-auto text-xs text-muted">
                            {new Date(u.occurredAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                            {late && ` · logged ${timeAgo(u.createdAt)}`}
                          </span>
                        </div>
                        <p className="mt-1.5 whitespace-pre-wrap text-sm">{u.body}</p>
                      </Card>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))
        )}
      </div>

      <Card className="h-fit space-y-3 p-4 text-sm">
        <h3 className="font-semibold">Legend</h3>
        <ul className="space-y-2">
          {UPDATE_KINDS.map((k) => (
            <li key={k} className="flex items-start gap-2">
              <span className={cx("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", KIND_STYLE[k].dot)} />
              <span>
                <span className="font-medium">{label(k)}</span> <span className="text-muted">— {KIND_STYLE[k].hint}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="border-t border-line pt-3 text-xs text-muted">
          Entries cannot be edited or deleted. Post a correction as a new update instead. &ldquo;Logged … ago&rdquo; marks an entry dated earlier than when it was posted.
        </p>
      </Card>
    </div>
  );
}
