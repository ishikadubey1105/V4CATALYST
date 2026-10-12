"use client";

import Link from "next/link";
import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/* ─── Brand ─── */

// Two owners and the line that passes between them: one solid, one handed on.
export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#2f54eb" />
      <circle cx="9.5" cy="16" r="3.5" fill="#fff" />
      <circle cx="22.5" cy="16" r="3.5" fill="none" stroke="#fff" strokeWidth="2" />
      <path d="M13 16h4.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      <path d="M15.5 13.5 18 16l-2.5 2.5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ─── Buttons ─── */

type Variant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink shadow-sm hover:bg-accent-hover",
  secondary: "bg-surface text-ink border border-line-strong shadow-sm hover:bg-surface-2",
  ghost: "text-ink-2 hover:text-ink hover:bg-surface-3",
  danger: "bg-bad text-white shadow-sm hover:opacity-90",
};
const sizes = { sm: "h-8 px-3 text-[13px]", md: "h-9 px-3.5 text-sm", lg: "h-11 px-5 text-[15px]" };

export function Button({
  variant = "secondary",
  size = "md",
  loading,
  icon: Icon,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: keyof typeof sizes; loading?: boolean; icon?: LucideIcon }) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        sizes[size],
        variants[variant],
        className,
      )}
    >
      {loading ? <Spinner /> : Icon ? <Icon size={16} strokeWidth={2} aria-hidden /> : null}
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = "secondary",
  size = "md",
  icon: Icon,
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  size?: keyof typeof sizes;
  icon?: LucideIcon;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={cx("inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors", sizes[size], variants[variant], className)}>
      {Icon && <Icon size={16} strokeWidth={2} aria-hidden />}
      {children}
    </Link>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cx("inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent", className)} aria-hidden />;
}

/* ─── Surfaces ─── */

export function Card({ className, children, id }: { className?: string; children: ReactNode; id?: string }) {
  return (
    <div id={id} className={cx("rounded-xl border border-line bg-surface shadow-sm", className)}>
      {children}
    </div>
  );
}

export function CardHeader({ title, sub, action, icon: Icon }: { title: ReactNode; sub?: ReactNode; action?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex items-center gap-3 border-b border-line px-5 py-3.5">
      {Icon && <Icon size={18} className="text-muted" aria-hidden />}
      <div className="min-w-0 flex-1">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {sub && <p className="text-[13px] text-muted">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ eyebrow, title, sub, actions }: { eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-[13px] text-muted">{eyebrow}</div>}
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.015em]">{title}</h1>
        {sub && <p className="mt-1 max-w-2xl text-[15px] text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

type Tone = "neutral" | "accent" | "good" | "warn" | "bad";
const tones: Record<Tone, string> = {
  neutral: "bg-surface-3 text-ink-2",
  accent: "bg-accent-soft text-accent",
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
};
const dotTones: Record<Tone, string> = { neutral: "bg-muted", accent: "bg-accent", good: "bg-good", warn: "bg-warn", bad: "bg-bad" };

export function Badge({ tone = "neutral", dot, children, className }: { tone?: Tone; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", tones[tone], className)}>
      {dot && <span className={cx("h-1.5 w-1.5 rounded-full", dotTones[tone])} />}
      {children}
    </span>
  );
}

export function StatCard({ label, value, icon: Icon, tone = "neutral", hint }: { label: string; value: ReactNode; icon: LucideIcon; tone?: Tone; hint?: ReactNode }) {
  const iconTone: Record<Tone, string> = {
    neutral: "bg-surface-3 text-ink-2",
    accent: "bg-accent-soft text-accent",
    good: "bg-good-soft text-good",
    warn: "bg-warn-soft text-warn",
    bad: "bg-bad-soft text-bad",
  };
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] text-muted">{label}</div>
          <div className="mt-1 text-[28px] font-semibold leading-none tracking-tight tabular-nums">{value}</div>
          {hint && <div className="mt-2 text-xs text-muted">{hint}</div>}
        </div>
        <span className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", iconTone[tone])}>
          <Icon size={18} aria-hidden />
        </span>
      </div>
    </Card>
  );
}

/* ─── Forms ─── */

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[13px] font-medium text-ink-2">{label}</span>
      {children}
      {hint && !error && <span className="block text-xs text-muted">{hint}</span>}
      {error && <span className="block text-xs text-bad">{error}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink shadow-sm placeholder:text-muted outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/15";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputCls, "h-10", props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(inputCls, "min-h-20 leading-relaxed", props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputCls, "h-10 py-0", props.className)} />;
}

export function ErrorNote({ error }: { error: string | null | undefined }) {
  if (!error) return null;
  return (
    <div role="alert" className="rounded-lg border border-bad/25 bg-bad-soft px-3 py-2 text-sm text-bad">
      {error}
    </div>
  );
}

export function Empty({ title, children, icon: Icon }: { title: string; children?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong px-6 py-12 text-center">
      {Icon && <Icon size={22} className="mx-auto mb-2 text-muted" aria-hidden />}
      <p className="font-medium text-ink">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-sm text-sm text-muted">{children}</div>}
    </div>
  );
}

export function PageLoading() {
  return (
    <div className="flex items-center justify-center py-24 text-muted" aria-label="Loading">
      <Spinner className="h-6 w-6" />
    </div>
  );
}

/* ─── People ─── */

export function Avatar({ name, size = 28 }: { name: string | null | undefined; size?: number }) {
  const initials = (name ?? "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  let h = 0;
  for (const ch of name ?? "") h = (h * 31 + ch.charCodeAt(0)) % 360;
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-surface"
      style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${h} 42% 46%)` }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

/* ─── Readiness ─── */

export function scoreTone(score: number, blockers: number): Tone {
  if (blockers > 0) return "bad";
  if (score < 100) return "warn";
  return "good";
}
const toneVar: Record<Tone, string> = { bad: "var(--bad)", warn: "var(--warn)", good: "var(--good)", accent: "var(--accent)", neutral: "var(--muted)" };

// The number is for the human; submission is gated on findings, not the score.
export function Gauge({ score, blockers, size = 140, label = "readiness" }: { score: number; blockers: number; size?: number; label?: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const color = toneVar[scoreTone(score, blockers)];
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={`Handoff readiness ${score} percent`}>
      <circle cx="60" cy="60" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="9" />
      <circle
        cx="60"
        cy="60"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - score / 100)}
        transform="rotate(-90 60 60)"
        style={{ transition: "stroke-dashoffset 600ms cubic-bezier(.2,.8,.2,1), stroke 300ms" }}
      />
      <text x="60" y="64" textAnchor="middle" fontSize="27" fontWeight="600" fill="var(--ink)" style={{ fontFamily: "var(--font-sans)" }}>
        {score}
        <tspan fontSize="15" fill="var(--muted)">%</tspan>
      </text>
      <text x="60" y="81" textAnchor="middle" fontSize="9.5" letterSpacing=".08em" fill="var(--muted)" style={{ fontFamily: "var(--font-sans)", textTransform: "uppercase" }}>
        {label}
      </text>
    </svg>
  );
}

// Compact ring for tables.
export function Ring({ score, blockers, size = 34 }: { score: number; blockers: number; size?: number }) {
  const r = 14;
  const c = 2 * Math.PI * r;
  return (
    <span className="inline-flex items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden>
        <circle cx="18" cy="18" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="4" />
        <circle cx="18" cy="18" r={r} fill="none" stroke={toneVar[scoreTone(score, blockers)]} strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} transform="rotate(-90 18 18)" />
      </svg>
      <span className="text-sm font-semibold tabular-nums">{score}%</span>
    </span>
  );
}

/* ─── Overlays ─── */

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-chrome/50 p-4 pt-[12vh] backdrop-blur-[2px]" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="rise w-full max-w-lg rounded-2xl border border-line bg-surface p-6 shadow-lg" onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

/* ─── Text ─── */

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <code className={cx("font-mono text-xs text-muted break-all", className)}>{children}</code>;
}

export function shortHash(h: string | null | undefined) {
  return h ? `${h.slice(0, 10)}…${h.slice(-6)}` : "—";
}
