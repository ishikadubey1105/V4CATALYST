"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowRight, Fingerprint, Link2, ShieldCheck } from "lucide-react";
import { api, ApiError } from "@/lib/client";
import { safeNext } from "@/lib/paths";
import { Avatar, Badge, Button, ErrorNote, Field, Input, Logo } from "@/components/ui";

const DEMO = [
  { email: "priya@relay.demo", name: "Priya Nair", role: "Member", note: "Owns the Acme case, on leave tomorrow" },
  { email: "rahul@relay.demo", name: "Rahul Verma", role: "Member", note: "Receives Priya's case" },
  { email: "anjali@relay.demo", name: "Anjali Desai", role: "Manager", note: "Team lead, can reassign" },
  { email: "auditor@relay.demo", name: "Meera Iyer", role: "Auditor", note: "Read-only, verifies history" },
  { email: "admin@relay.demo", name: "Relay Admin", role: "Admin", note: "Sets the gate policy" },
];
const DEMO_PASSWORD = "relay-demo";

const PILLARS = [
  { icon: ShieldCheck, title: "A gate that can say no", body: "Twelve checks run before responsibility moves. Blockers must be fixed; gaps must be disclosed in writing." },
  { icon: Fingerprint, title: "A package you sign for", body: "The new owner accepts a SHA-256 fingerprinted snapshot, so “nobody told me” cannot happen." },
  { icon: Link2, title: "History that cannot be rewritten", body: "Every action is hash-chained. Edit one row in the database and verification names it." },
];

function GatePreview() {
  return (
    <div className="rounded-2xl border border-chrome-line bg-chrome-2/80 p-4 shadow-lg" aria-hidden>
      <div className="flex items-center gap-3">
        <svg width="56" height="56" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="14" fill="none" stroke="#1f2a44" strokeWidth="4" />
          <circle cx="18" cy="18" r="14" fill="none" stroke="#f27a72" strokeWidth="4" strokeLinecap="round" strokeDasharray="88" strokeDashoffset="37" transform="rotate(-90 18 18)" />
          <text x="18" y="21" textAnchor="middle" fontSize="8" fontWeight="600" fill="#fff">58%</text>
        </svg>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white">Handoff refused</div>
          <div className="text-xs text-chrome-muted">Acme Corp · Priya → Rahul</div>
        </div>
      </div>
      <ul className="mt-3 space-y-1.5 text-xs">
        {["Decision has no recorded rationale", "In-progress work left with the outgoing owner", "Required invoice not attached"].map((t) => (
          <li key={t} className="flex items-center gap-2 rounded-md bg-[#341716]/70 px-2.5 py-1.5 text-[#ffb4ae]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#f27a72]" /> {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LoginForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signIn(e: string, p: string) {
    setBusy(e);
    setError(null);
    try {
      await api("/api/auth/login", { method: "POST", json: { email: e, password: p } });
      router.push(next);
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
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-chrome px-12 py-10 text-chrome-ink lg:flex lg:flex-col">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{ backgroundImage: "radial-gradient(circle at 1px 1px, #1f2a44 1px, transparent 0)", backgroundSize: "24px 24px" }}
          aria-hidden
        />
        <div className="relative flex items-center gap-2.5">
          <Logo size={32} />
          <span className="text-lg font-semibold tracking-tight">Relay</span>
        </div>
        <div className="relative my-auto max-w-lg py-12">
          <p className="mb-4 text-[13px] font-medium uppercase tracking-[0.14em] text-[#9fb3ff]">Handoff continuity</p>
          <h1 className="text-[40px] font-semibold leading-[1.1] tracking-[-0.02em] text-white">A handoff is a transaction the system can refuse.</h1>
          <p className="mt-4 text-[16px] leading-relaxed text-chrome-muted">
            When a case changes hands, Relay checks it for missing context, unowned work and undocumented decisions, and keeps a record nobody can quietly edit.
          </p>
          <div className="mt-8 max-w-sm">
            <GatePreview />
          </div>
          <ul className="mt-10 space-y-5">
            {PILLARS.map((p) => (
              <li key={p.title} className="flex gap-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-chrome-2 text-[#9fb3ff] ring-1 ring-chrome-line">
                  <p.icon size={18} aria-hidden />
                </span>
                <div>
                  <div className="text-[15px] font-medium text-white">{p.title}</div>
                  <div className="text-sm leading-relaxed text-chrome-muted">{p.body}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-chrome-muted">Hackathon PS 3 · Digital Handoff &amp; Continuity Management</p>
      </section>

      <section className="flex items-center justify-center bg-bg px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <Logo size={30} />
            <span className="text-lg font-semibold">Relay</span>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
          <p className="mt-1 text-sm text-muted">Use your work email, or pick a demo account below.</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <Field label="Email">
              <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label="Password">
              <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            <ErrorNote error={error} />
            <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy === email && !!email}>
              Sign in
            </Button>
          </form>

          <div className="my-7 flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-line" /> Demo accounts · password <code className="font-mono">{DEMO_PASSWORD}</code> <span className="h-px flex-1 bg-line" />
          </div>

          <ul className="space-y-2">
            {DEMO.map((d) => (
              <li key={d.email}>
                <button
                  onClick={() => signIn(d.email, DEMO_PASSWORD)}
                  disabled={!!busy}
                  className="group flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-3 text-left shadow-sm transition hover:border-accent/50 hover:shadow-md disabled:opacity-60"
                >
                  <Avatar name={d.name} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-medium">{d.name}</span>
                      <Badge>{d.role}</Badge>
                    </span>
                    <span className="block truncate text-[13px] text-muted">{d.note}</span>
                  </span>
                  {busy === d.email ? (
                    <span className="text-xs text-muted">Signing in…</span>
                  ) : (
                    <ArrowRight size={16} className="text-muted transition group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
