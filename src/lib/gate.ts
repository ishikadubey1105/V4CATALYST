import { REQUIRED_DOCS, label } from "./domain";

// The readiness gate. A pure function over an already-loaded case: no queries,
// no side effects, `now` injected so every date rule is testable.

export type Severity = "BLOCKER" | "WARNING";

export type GateRuleRow = {
  code: string;
  label: string;
  severity: string;
  weight: number;
  enabled: boolean;
};

export type GateCase = {
  id: string;
  summary: string;
  caseType: string;
  currentOwnerId: string;
  deadline: Date | null;
  createdAt: Date;
  contextItems: { id: string; kind: string; title: string; resolvedAt: Date | null; createdAt: Date }[];
  decisions: { id: string; title: string; rationale: string; decidedAt: Date; refDocumentId: string | null }[];
  actions: {
    id: string;
    title: string;
    status: string;
    assigneeId: string | null;
    dueDate: Date | null;
    blockedReason: string | null;
    noteUpdatedAt: Date | null;
    refDocumentId: string | null;
  }[];
  documents: { id: string; filename: string; docClass: string }[];
};

export type Finding = {
  code: string;
  severity: Severity;
  label: string;
  message: string;
  weight: number;
  fixPath: string;
  targetId?: string;
  waived: boolean;
};

export type RuleResult = {
  code: string;
  label: string;
  severity: Severity;
  weight: number;
  applicable: boolean;
  passed: boolean;
  waived: boolean;
};

export type Readiness = {
  score: number;
  canSubmit: boolean;
  blockers: Finding[];
  warnings: Finding[];
  rules: RuleResult[];
};

type Partial = { message: string; fixPath: string; targetId?: string };
type Ctx = { c: GateCase; recipientId: string | null; now: Date };
type RuleFn = (ctx: Ctx) => Partial[] | null; // null = rule does not apply

const DAY = 86_400_000;
const MIN_SUMMARY = 120;

const tab = (c: GateCase, name: string, focus?: string) =>
  `/cases/${c.id}?tab=${name}${focus ? `&focus=${focus}` : ""}`;

const isOpen = (status: string) => status !== "DONE";

export const REGISTRY: Record<string, RuleFn> = {
  NO_SUMMARY: ({ c }) =>
    c.summary.trim().length < MIN_SUMMARY
      ? [{
          message: `Summary is ${c.summary.trim().length} characters; a receiver needs at least ${MIN_SUMMARY} to start from.`,
          fixPath: tab(c, "overview", "summary"),
        }]
      : [],

  UNOWNED_ACTIVE_WORK: ({ c, recipientId }) =>
    c.actions
      .filter((a) => a.status === "IN_PROGRESS" && a.assigneeId === c.currentOwnerId && a.assigneeId !== recipientId)
      .map((a) => ({
        message: `"${a.title}" is in progress and still assigned to the outgoing owner.`,
        fixPath: tab(c, "actions", a.id),
        targetId: a.id,
      })),

  DECISION_NO_RATIONALE: ({ c }) =>
    c.decisions
      .filter((d) => !d.rationale.trim())
      .map((d) => ({
        message: `Decision "${d.title}" has no recorded rationale.`,
        fixPath: tab(c, "decisions", d.id),
        targetId: d.id,
      })),

  IMMINENT_UNDOCUMENTED: ({ c, now }) =>
    c.actions
      .filter(
        (a) =>
          isOpen(a.status) &&
          a.dueDate &&
          a.dueDate.getTime() >= now.getTime() &&
          a.dueDate.getTime() - now.getTime() <= 2 * DAY &&
          (!a.noteUpdatedAt || now.getTime() - a.noteUpdatedAt.getTime() > 7 * DAY),
      )
      .map((a) => ({
        message: `"${a.title}" is due within 48 hours and has no note from the last 7 days.`,
        fixPath: tab(c, "actions", a.id),
        targetId: a.id,
      })),

  UNANSWERED_QUESTION: ({ c }) =>
    c.contextItems
      .filter((i) => i.kind === "OPEN_QUESTION" && !i.resolvedAt)
      .map((i) => ({
        message: `Open question "${i.title}" has no recorded resolution.`,
        fixPath: tab(c, "context", i.id),
        targetId: i.id,
      })),

  BLOCKED_NO_REASON: ({ c }) =>
    c.actions
      .filter((a) => a.status === "BLOCKED" && !a.blockedReason?.trim())
      .map((a) => ({
        message: `"${a.title}" is blocked with no reason given.`,
        fixPath: tab(c, "actions", a.id),
        targetId: a.id,
      })),

  MISSING_REQUIRED_DOC: ({ c }) => {
    const required = REQUIRED_DOCS[c.caseType] ?? [];
    if (required.length === 0) return null;
    const present = new Set(c.documents.map((d) => d.docClass));
    return required
      .filter((cls) => !present.has(cls))
      .map((cls) => ({
        message: `${label(c.caseType)} cases require a ${label(cls).toLowerCase()} document; none is attached.`,
        fixPath: tab(c, "documents", `upload-${cls}`),
      }));
  },

  STALE_CONTEXT: ({ c, now }) => {
    const times = [...c.contextItems.map((i) => i.createdAt), ...c.decisions.map((d) => d.decidedAt)].map((d) => d.getTime());
    const latest = times.length ? Math.max(...times) : c.createdAt.getTime();
    const days = Math.floor((now.getTime() - latest) / DAY);
    return days > 14
      ? [{ message: `Nothing has been added to the case context in ${days} days.`, fixPath: tab(c, "context", "new") }]
      : [];
  },

  OVERDUE_ITEMS: ({ c, now }) =>
    c.actions
      .filter((a) => isOpen(a.status) && a.dueDate && a.dueDate.getTime() < now.getTime())
      .map((a) => ({
        message: `"${a.title}" was due ${Math.max(1, Math.floor((now.getTime() - a.dueDate!.getTime()) / DAY))} day(s) ago.`,
        fixPath: tab(c, "actions", a.id),
        targetId: a.id,
      })),

  DEADLINE_SOON: ({ c, now }) => {
    if (!c.deadline) return null;
    const days = Math.ceil((c.deadline.getTime() - now.getTime()) / DAY);
    return days <= 7
      ? [{ message: `The case deadline is ${days <= 0 ? "already past" : `in ${days} day(s)`}; the receiver inherits it with little runway.`, fixPath: tab(c, "overview", "deadline") }]
      : [];
  },

  ORPHAN_DOC: ({ c }) => {
    if (c.documents.length === 0) return null;
    const referenced = new Set(
      [...c.decisions.map((d) => d.refDocumentId), ...c.actions.map((a) => a.refDocumentId)].filter(Boolean),
    );
    // A document the case-type policy requires is explained by that policy.
    const required = new Set<string>(REQUIRED_DOCS[c.caseType] ?? []);
    return c.documents
      .filter((d) => !referenced.has(d.id) && !required.has(d.docClass))
      .map((d) => ({
        message: `"${d.filename}" is attached but no decision or action refers to it.`,
        fixPath: tab(c, "documents", d.id),
        targetId: d.id,
      }));
  },

  THIN_HISTORY: ({ c, now }) => {
    if (now.getTime() - c.createdAt.getTime() < 30 * DAY) return null;
    return c.contextItems.length < 3
      ? [{ message: `Only ${c.contextItems.length} context item(s) on a case older than 30 days.`, fixPath: tab(c, "context", "new") }]
      : [];
  },
};

export function evaluate(
  c: GateCase,
  rules: GateRuleRow[],
  recipientId: string | null,
  waived: string[] = [],
  now: Date = new Date(),
): Readiness {
  const ctx: Ctx = { c, recipientId, now };
  const blockers: Finding[] = [];
  const warnings: Finding[] = [];
  const results: RuleResult[] = [];
  const waivedSet = new Set(waived);

  for (const rule of rules) {
    const fn = REGISTRY[rule.code];
    if (!fn || !rule.enabled) continue;
    const severity = rule.severity as Severity;
    const out = fn(ctx);
    const applicable = out !== null;
    const passed = !out || out.length === 0;
    // Only warnings can be waived; a waived blocker code is ignored.
    const isWaived = severity === "WARNING" && waivedSet.has(rule.code) && !passed;
    results.push({ code: rule.code, label: rule.label, severity, weight: rule.weight, applicable, passed, waived: isWaived });
    for (const p of out ?? []) {
      const finding: Finding = { ...p, code: rule.code, label: rule.label, severity, weight: rule.weight, waived: isWaived };
      (severity === "BLOCKER" ? blockers : warnings).push(finding);
    }
  }

  // Score is rule-level: a rule passes when it has no findings, or when it is a
  // waived warning. Inapplicable rules leave both sums, so a sparse case cannot
  // score well by default.
  const applicable = results.filter((r) => r.applicable);
  const total = applicable.reduce((s, r) => s + r.weight, 0);
  const earned = applicable.filter((r) => r.passed || r.waived).reduce((s, r) => s + r.weight, 0);
  const score = total === 0 ? 100 : Math.round((100 * earned) / total);

  return { score, canSubmit: blockers.length === 0, blockers, warnings, rules: results };
}
