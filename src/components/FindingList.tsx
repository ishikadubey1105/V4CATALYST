"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, CircleCheck, OctagonX } from "lucide-react";
import type { Finding } from "@/lib/gate";
import { cx } from "./ui";

// Groups findings by rule so "2 warnings" means two rules, each with its instances.
function groupFindings(findings: Finding[]) {
  const groups = new Map<string, Finding[]>();
  for (const f of findings) groups.set(f.code, [...(groups.get(f.code) ?? []), f]);
  return [...groups.entries()].map(([code, items]) => ({ code, label: items[0].label, severity: items[0].severity, waived: items[0].waived, items }));
}

export function FindingList({
  findings,
  linkSuffix = "",
  renderAside,
}: {
  findings: Finding[];
  linkSuffix?: string;
  renderAside?: (code: string, waived: boolean) => React.ReactNode;
}) {
  const groups = groupFindings(findings);
  if (groups.length === 0) return null;
  return (
    <ul className="space-y-2.5">
      {groups.map((g) => {
        const blocker = g.severity === "BLOCKER";
        const Icon = g.waived ? CircleCheck : blocker ? OctagonX : AlertTriangle;
        return (
          <li
            key={g.code}
            className={cx(
              "rounded-xl border bg-surface p-4 shadow-sm",
              g.waived ? "border-line" : blocker ? "border-bad/30" : "border-warn/30",
            )}
          >
            <div className="flex items-start gap-3">
              <span
                className={cx(
                  "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                  g.waived ? "bg-surface-3 text-muted" : blocker ? "bg-bad-soft text-bad" : "bg-warn-soft text-warn",
                )}
              >
                <Icon size={16} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className={cx("text-[11px] font-semibold uppercase tracking-wide", g.waived ? "text-muted" : blocker ? "text-bad" : "text-warn")}>
                    {g.waived ? "Waived" : blocker ? "Blocker" : "Warning"}
                  </span>
                  <span className="text-sm font-semibold text-ink">{g.label}</span>
                </div>
                <ul className="mt-2 space-y-1">
                  {g.items.map((f, i) => (
                    <li key={i}>
                      <Link
                        href={f.fixPath + linkSuffix}
                        className="group -mx-2 flex items-start gap-2 rounded-md px-2 py-1 text-[13px] leading-snug text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
                      >
                        <span className="min-w-0 flex-1">{f.message}</span>
                        <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-accent opacity-70 transition group-hover:opacity-100">
                          Fix <ArrowRight size={13} aria-hidden />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <code className="mt-1.5 block font-mono text-[10.5px] text-muted">{g.code}</code>
                {renderAside?.(g.code, g.waived)}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
