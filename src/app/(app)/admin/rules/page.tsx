"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/client";
import { useMe } from "@/components/AppShell";
import { Badge, Button, Card, ErrorNote, PageLoading, cx } from "@/components/ui";

type Rule = { code: string; label: string; severity: string; weight: number; enabled: boolean };

export default function RulesPage() {
  const me = useMe();
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sweep, setSweep] = useState<string | null>(null);
  const admin = me.role === "ADMIN";

  useEffect(() => {
    api<{ rules: Rule[] }>("/api/rules").then((r) => setRules(r.rules));
  }, []);

  async function patch(code: string, body: Partial<Rule>) {
    setError(null);
    try {
      const r = await api<{ rule: Rule }>("/api/rules", { method: "PATCH", json: { code, ...body } });
      setRules((rs) => rs!.map((x) => (x.code === code ? r.rule : x)));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not update.");
    }
  }

  async function runSweep() {
    const r = await api<{ flagged: number }>("/api/jobs/overdue-sweep", { method: "POST" });
    setSweep(`${r.flagged} newly overdue action${r.flagged === 1 ? "" : "s"} flagged and owners notified.`);
  }

  if (!rules) return <PageLoading />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Gate policy</h1>
          <p className="text-sm text-muted">
            The checks every case passes before it can change hands. Policy is data, not code: {admin ? "switch a rule off or reweight it and every gate updates." : "only an admin can change it."}
          </p>
        </div>
        <Button onClick={runSweep}>Run overdue sweep</Button>
      </div>
      {sweep && <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">{sweep}</p>}
      <ErrorNote error={error} />
      {(["BLOCKER", "WARNING"] as const).map((sev) => (
        <Card key={sev}>
          <div className="border-b border-line px-4 py-3">
            <h2 className="font-semibold">{sev === "BLOCKER" ? "Blockers — submission is refused" : "Warnings — fix or waive in writing"}</h2>
          </div>
          <ul>
            {rules
              .filter((r) => r.severity === sev)
              .map((r) => (
                <li key={r.code} className={cx("flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 last:border-0", !r.enabled && "opacity-50")}>
                  <Badge tone={sev === "BLOCKER" ? "bad" : "warn"}>{sev === "BLOCKER" ? "Blocker" : "Warning"}</Badge>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{r.label}</div>
                    <code className="font-mono text-xs text-muted">{r.code}</code>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-muted">
                    Weight
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={r.weight}
                      disabled={!admin}
                      onChange={(e) => patch(r.code, { weight: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })}
                      className="h-8 w-14 rounded-md border border-line bg-surface px-2 text-ink disabled:opacity-60"
                    />
                  </label>
                  <button
                    role="switch"
                    aria-checked={r.enabled}
                    aria-label={`${r.enabled ? "Disable" : "Enable"} ${r.label}`}
                    disabled={!admin}
                    onClick={() => patch(r.code, { enabled: !r.enabled })}
                    className={cx("relative h-6 w-11 rounded-full transition disabled:cursor-not-allowed", r.enabled ? "bg-accent" : "bg-line")}
                  >
                    <span className={cx("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition", r.enabled ? "left-[22px]" : "left-0.5")} />
                  </button>
                </li>
              ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
