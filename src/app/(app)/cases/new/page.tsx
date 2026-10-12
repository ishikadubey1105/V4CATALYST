"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, ApiError, fromDateInput } from "@/lib/client";
import { CASE_TYPES, PRIORITIES, REQUIRED_DOCS, label } from "@/lib/domain";
import { Button, ButtonLink, Card, ErrorNote, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";

export default function NewCasePage() {
  const router = useRouter();
  const [form, setForm] = useState({ title: "", summary: "", caseType: "GENERAL", priority: "MEDIUM", deadline: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ case: { id: string } }>("/api/cases", {
        method: "POST",
        json: { ...form, deadline: fromDateInput(form.deadline) },
      });
      router.push(`/cases/${r.case.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the case.");
      setBusy(false);
    }
  }

  const required = REQUIRED_DOCS[form.caseType] ?? [];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="New case" sub="You become the accountable owner. Ownership changes only through a handoff or a manager reassignment." />
      <Card className="p-6">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Title">
            <Input value={form.title} onChange={set("title")} placeholder="Customer — what this is about" required minLength={3} />
          </Field>
          <Field label="Summary" hint={`${form.summary.trim().length}/120 characters minimum before this case can be handed off.`}>
            <Textarea rows={4} value={form.summary} onChange={set("summary")} placeholder="What is happening, what has been done, and what the next owner needs to know first." />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Type">
              <Select value={form.caseType} onChange={set("caseType")}>
                {CASE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {label(t)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Priority">
              <Select value={form.priority} onChange={set("priority")}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {label(p)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Deadline">
              <Input type="date" value={form.deadline} onChange={set("deadline")} />
            </Field>
          </div>
          {required.length > 0 && (
            <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">
              {label(form.caseType)} cases must carry a {required.map((r) => label(r).toLowerCase()).join(" and ")} document before they can change hands.
            </p>
          )}
          <ErrorNote error={error} />
          <div className="flex justify-end gap-2">
            <ButtonLink href="/">Cancel</ButtonLink>
            <Button type="submit" variant="primary" loading={busy}>
              Create case
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
