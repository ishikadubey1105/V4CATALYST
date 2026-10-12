"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { CheckCircle2, FileCheck2, KeyRound, Link2, Lock, RefreshCw, ShieldAlert, ShieldCheck, UserX, XCircle } from "lucide-react";
import { fmtDateTime } from "@/lib/client";
import { label } from "@/lib/domain";
import { Badge, Button, Card, CardHeader, Mono, PageHeader, StatCard, cx, shortHash } from "@/components/ui";

export type SecurityData = {
  checkedAt: string;
  chains: { caseId: string; title: string; team: string; entries: number; ok: boolean; brokenAtSeq: number | null; reason: string | null; head: string | null }[];
  bypasses: { caseId: string; title: string; by: string; to: string; reason: string; score: number | null; at: string }[];
  packages: {
    handoffId: string;
    title: string;
    from: string;
    to: string;
    state: string;
    score: number | null;
    intact: boolean;
    waivers: { code: string; justification: string; by: string }[];
    at: string;
  }[];
  accounts: { name: string; email: string; role: string; failed: number; lockedUntil: string | null }[] | null;
};

const REASONS: Record<string, string> = {
  HASH_MISMATCH: "an entry's contents were changed",
  LINK_MISMATCH: "an entry no longer links to the one before",
  SEQ_GAP: "an entry is missing",
  HEAD_MISMATCH: "the newest entries were removed",
};

// The controls actually enforced by this build, so a reviewer can check each one.
const CONTROLS = [
  { icon: KeyRound, title: "Sign-in", body: "bcrypt passwords; account locks for 15 minutes after 5 failures; per-network rate limit." },
  { icon: Lock, title: "Sessions", body: "Signed, HTTP-only, SameSite cookies. Signing out revokes every earlier session on the server." },
  { icon: ShieldCheck, title: "Access control", body: "Role checks on every API route, not in the browser. Cases you cannot see return 404." },
  { icon: Link2, title: "Tamper evidence", body: "Every change is SHA-256 hash-chained in the same transaction as the change itself." },
  { icon: FileCheck2, title: "Documents", body: "Type checked by file signature, fingerprinted on upload, re-verified on every download." },
  { icon: ShieldAlert, title: "Browser hardening", body: "Content-Security-Policy, no framing, cross-site request check, strict referrer policy." },
];

export function SecurityDashboard({ data }: { data: SecurityData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const broken = data.chains.filter((c) => !c.ok);
  const entries = data.chains.reduce((s, c) => s + c.entries, 0);
  const waivers = data.packages.reduce((s, p) => s + p.waivers.length, 0);
  const alteredPackages = data.packages.filter((p) => !p.intact);

  return (
    <div className="space-y-7">
      <PageHeader
        title="Security"
        sub="Integrity of every case history you can see, every time the gate was skipped or a gap was waived, and the controls that protect them."
        actions={
          <Button icon={RefreshCw} loading={pending} onClick={() => start(() => router.refresh())}>
            Re-verify now
          </Button>
        }
      />

      <div
        className={cx(
          "flex items-start gap-3 rounded-xl border px-5 py-4",
          broken.length || alteredPackages.length ? "border-bad/30 bg-bad-soft" : "border-good/30 bg-good-soft",
        )}
        role="status"
      >
        {broken.length || alteredPackages.length ? (
          <XCircle size={22} className="mt-0.5 shrink-0 text-bad" aria-hidden />
        ) : (
          <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-good" aria-hidden />
        )}
        <div className="text-sm">
          <div className={cx("text-[15px] font-semibold", broken.length || alteredPackages.length ? "text-bad" : "text-good")}>
            {broken.length
              ? `Tampering detected in ${broken.length} case histor${broken.length > 1 ? "ies" : "y"}`
              : alteredPackages.length
                ? `${alteredPackages.length} handoff package${alteredPackages.length > 1 ? "s" : ""} altered after submission`
                : `All ${data.chains.length} case histories and ${data.packages.length} handoff packages verify`}
          </div>
          <div className="text-ink-2">Recomputed from the raw database rows at {fmtDateTime(data.checkedAt)}. Nothing on this page is cached.</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="History entries verified" value={entries} icon={Link2} tone="accent" hint={`${data.chains.length} cases`} />
        <StatCard label="Tampered histories" value={broken.length} icon={ShieldAlert} tone={broken.length ? "bad" : "good"} />
        <StatCard label="Gate bypasses" value={data.bypasses.length} icon={UserX} tone={data.bypasses.length ? "warn" : "neutral"} hint="Manager reassignments" />
        <StatCard label="Gaps waived" value={waivers} icon={FileCheck2} tone={waivers ? "warn" : "neutral"} hint="Disclosed at handoff" />
      </div>

      <Card className="overflow-hidden">
        <CardHeader icon={Link2} title="Case history integrity" sub="Each history is a SHA-256 chain. Any edited, removed or reordered entry breaks it." />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-2.5 font-medium">Case</th>
                <th className="px-4 py-2.5 font-medium">Entries</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-5 py-2.5 font-medium">Head hash</th>
              </tr>
            </thead>
            <tbody>
              {data.chains.map((c) => (
                <tr key={c.caseId} className={cx("border-b border-line last:border-0", !c.ok && "bg-bad-soft/60")}>
                  <td className="px-5 py-3">
                    <Link href={`/cases/${c.caseId}?tab=activity`} className="font-medium hover:text-accent">
                      {c.title}
                    </Link>
                    <div className="text-xs text-muted">{c.team}</div>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{c.entries}</td>
                  <td className="px-4 py-3">
                    {c.ok ? (
                      <Badge tone="good" dot>
                        Intact
                      </Badge>
                    ) : (
                      <div>
                        <Badge tone="bad" dot>
                          Broken at #{c.brokenAtSeq}
                        </Badge>
                        <div className="mt-1 text-xs text-bad">{REASONS[c.reason ?? ""] ?? c.reason}</div>
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <Mono>{c.head ? shortHash(c.head) : "—"}</Mono>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader icon={UserX} title="Gate bypasses" sub="A manager moved a case without the readiness check." />
          {data.bypasses.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">No case has been reassigned around the gate.</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.bypasses.map((b, i) => (
                <li key={i} className="px-5 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{b.title}</span>
                    {b.score !== null && <Badge tone="warn">{b.score}% ready at bypass</Badge>}
                  </div>
                  <div className="mt-0.5 text-ink-2">
                    {b.by} → {b.to}: “{b.reason}”
                  </div>
                  <div className="text-xs text-muted">{fmtDateTime(b.at)}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader icon={FileCheck2} title="Handoff packages" sub="Each package is fingerprinted at submission; the receiver signs for that hash." />
          {data.packages.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">No handoffs have been submitted yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.packages.map((p) => (
                <li key={p.handoffId} className="px-5 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/handoffs/${p.handoffId}`} className="font-medium hover:text-accent">
                      {p.title}
                    </Link>
                    <Badge tone={p.state === "ACCEPTED" ? "good" : p.state === "REJECTED" ? "bad" : "accent"}>{label(p.state)}</Badge>
                    {p.intact ? <Badge tone="good">Package intact</Badge> : <Badge tone="bad">Package altered</Badge>}
                  </div>
                  <div className="mt-0.5 text-ink-2">
                    {p.from} → {p.to} · {p.score}% at submission
                  </div>
                  {p.waivers.map((w) => (
                    <div key={w.code} className="mt-1.5 rounded-md bg-warn-soft px-2.5 py-1.5 text-xs">
                      <span className="font-mono text-warn">{w.code}</span> “{w.justification}” <span className="text-muted">— {w.by}</span>
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {data.accounts && (
        <Card className="overflow-hidden">
          <CardHeader icon={KeyRound} title="Sign-in attempts" sub="Accounts with recent failed sign-ins or an active lockout. Visible to admins and auditors only." />
          {data.accounts.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">No failed sign-ins since each account&apos;s last successful one.</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.accounts.map((a) => (
                <li key={a.email} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  <span className="font-medium">{a.name}</span>
                  <span className="text-muted">{a.email}</span>
                  {a.lockedUntil ? (
                    <Badge tone="bad" dot>
                      Locked until {fmtDateTime(a.lockedUntil)}
                    </Badge>
                  ) : (
                    <Badge tone="warn">
                      {a.failed} failed attempt{a.failed > 1 ? "s" : ""}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <section>
        <h2 className="mb-3 text-[15px] font-semibold">Controls in this build</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CONTROLS.map((c) => (
            <Card key={c.title} className="p-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent">
                  <c.icon size={16} aria-hidden />
                </span>
                <span className="text-sm font-semibold">{c.title}</span>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">{c.body}</p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
