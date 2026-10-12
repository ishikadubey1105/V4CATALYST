"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/client";
import { Avatar, Badge, Button, Card, ErrorNote, Field, Input } from "@/components/ui";

const DEMO = [
  { email: "priya@relay.demo", name: "Priya Nair", role: "Member", note: "Outgoing owner, on leave tomorrow" },
  { email: "rahul@relay.demo", name: "Rahul Verma", role: "Member", note: "Receives Priya's case" },
  { email: "anjali@relay.demo", name: "Anjali Desai", role: "Manager", note: "Team lead, can reassign" },
  { email: "auditor@relay.demo", name: "Meera Iyer", role: "Auditor", note: "Read-only, verifies history" },
  { email: "admin@relay.demo", name: "Relay Admin", role: "Admin", note: "Sets the gate policy" },
];
const DEMO_PASSWORD = "relay-demo";

export function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signIn(e: string, p: string) {
    setBusy(e);
    setError(null);
    try {
      await api("/api/auth/login", { method: "POST", json: { email: e, password: p } });
      // Only follow same-site relative paths.
      router.push(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in.");
      setBusy(null);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    signIn(email, password);
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="grid w-full max-w-4xl gap-6 md:grid-cols-[1fr_1.1fr]">
        <div className="flex flex-col justify-center">
          <div className="mb-6 flex items-center gap-2 text-xl font-semibold">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-ink">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12h12M12 6l6 6-6 6" />
              </svg>
            </span>
            Relay
          </div>
          <h1 className="text-3xl font-bold leading-tight tracking-tight">A handoff is not a button.</h1>
          <p className="mt-3 text-muted">
            It is a transaction the system is allowed to refuse. Relay checks a case for missing context, unowned work and undocumented
            decisions before responsibility changes hands — and keeps a tamper-evident record of every transfer.
          </p>
          <Card className="mt-8 p-5">
            <form onSubmit={onSubmit} className="space-y-4">
              <Field label="Email">
                <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </Field>
              <Field label="Password">
                <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </Field>
              <ErrorNote error={error} />
              <Button type="submit" variant="primary" className="w-full" loading={busy === email && !!email}>
                Sign in
              </Button>
            </form>
          </Card>
        </div>

        <Card className="p-5">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="font-semibold">Demo accounts</h2>
            <Badge>password: {DEMO_PASSWORD}</Badge>
          </div>
          <p className="mb-4 text-sm text-muted">One click signs in. Switch roles to see the same case from each side.</p>
          <ul className="space-y-2">
            {DEMO.map((d) => (
              <li key={d.email}>
                <button
                  onClick={() => signIn(d.email, DEMO_PASSWORD)}
                  disabled={!!busy}
                  className="flex w-full items-center gap-3 rounded-lg border border-line p-3 text-left transition hover:border-accent hover:bg-accent-soft/40 disabled:opacity-60"
                >
                  <Avatar name={d.name} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="font-medium">{d.name}</span>
                      <Badge>{d.role}</Badge>
                    </span>
                    <span className="block truncate text-sm text-muted">{d.note}</span>
                  </span>
                  {busy === d.email ? <span className="text-sm text-muted">Signing in…</span> : <span className="text-muted">→</span>}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
