"use client";

import Link from "next/link";
import type { Finding } from "@/lib/gate";
import { Badge, cx } from "./ui";

// Groups findings by rule so "2 warnings" means two rules, each with its instances.
export function groupFindings(findings: Finding[]) {
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
    <ul className="space-y-2">
      {groups.map((g) => {
        const blocker = g.severity === "BLOCKER";
        return (
          <li
            key={g.code}
            className={cx(
              "rounded-lg border p-3",
              g.waived ? "border-line bg-surface-2/60" : blocker ? "border-bad/30 bg-bad-soft/50" : "border-warn/30 bg-warn-soft/50",
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={g.waived ? "neutral" : blocker ? "bad" : "warn"}>{g.waived ? "Waived" : blocker ? "Blocker" : "Warning"}</Badge>
              <span className="text-sm font-medium">{g.label}</span>
              <code className="font-mono text-[11px] text-muted">{g.code}</code>
            </div>
            <ul className="mt-2 space-y-1">
              {g.items.map((f, i) => (
                <li key={i}>
                  <Link href={f.fixPath + linkSuffix} className="group flex items-start gap-2 text-sm text-ink hover:text-accent">
                    <span className="mt-0.5 text-muted group-hover:text-accent">→</span>
                    <span>
                      {f.message} <span className="whitespace-nowrap text-accent opacity-0 transition group-hover:opacity-100">Fix this</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {renderAside?.(g.code, g.waived)}
          </li>
        );
      })}
    </ul>
  );
}
