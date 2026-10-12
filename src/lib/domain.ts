export const ROLES = ["ADMIN", "MANAGER", "MEMBER", "AUDITOR"] as const;
export type Role = (typeof ROLES)[number];

export const CASE_TYPES = [
  "BILLING_DISPUTE",
  "CUSTOMER_ESCALATION",
  "PROJECT",
  "INCIDENT",
  "GENERAL",
] as const;
export type CaseType = (typeof CASE_TYPES)[number];

export const CASE_STATUSES = ["ACTIVE", "IN_HANDOFF", "CLOSED"] as const;
export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const CONTEXT_KINDS = [
  "BACKGROUND",
  "CONSTRAINT",
  "STAKEHOLDER",
  "OPEN_QUESTION",
  "RISK",
] as const;
export const ACTION_STATUSES = ["OPEN", "IN_PROGRESS", "BLOCKED", "DONE"] as const;
export const DOC_CLASSES = ["INVOICE", "CONTRACT", "CORRESPONDENCE", "REPORT", "OTHER"] as const;
export type DocClass = (typeof DOC_CLASSES)[number];

export const HANDOFF_STATES = ["DRAFT", "PENDING_ACCEPT", "ACCEPTED", "REJECTED", "CANCELLED"] as const;
export type HandoffState = (typeof HANDOFF_STATES)[number];

// Case-type policy: document classes a case must carry before it can change hands.
export const REQUIRED_DOCS: Record<string, DocClass[]> = {
  BILLING_DISPUTE: ["INVOICE"],
  CUSTOMER_ESCALATION: ["CORRESPONDENCE"],
  PROJECT: [],
  INCIDENT: ["REPORT"],
  GENERAL: [],
};

export const LABELS: Record<string, string> = {
  BILLING_DISPUTE: "Billing dispute",
  CUSTOMER_ESCALATION: "Customer escalation",
  PROJECT: "Project",
  INCIDENT: "Incident",
  GENERAL: "General",
  ACTIVE: "Active",
  IN_HANDOFF: "In handoff",
  CLOSED: "Closed",
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  DONE: "Done",
  DRAFT: "Draft",
  PENDING_ACCEPT: "Awaiting acceptance",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
  BACKGROUND: "Background",
  CONSTRAINT: "Constraint",
  STAKEHOLDER: "Stakeholder",
  OPEN_QUESTION: "Open question",
  RISK: "Risk",
  INVOICE: "Invoice",
  CONTRACT: "Contract",
  CORRESPONDENCE: "Correspondence",
  REPORT: "Report",
  OTHER: "Other",
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
  CREATED: "Created",
  HANDOFF: "Handoff",
  REASSIGN: "Manager reassignment",
};

export const label = (v: string | null | undefined) => (v ? (LABELS[v] ?? v) : "");

export const BLOCKER_WEIGHT = 3;
export const WARNING_WEIGHT = 1;

export const DEFAULT_GATE_RULES = [
  { code: "NO_SUMMARY", label: "Case summary is too thin", severity: "BLOCKER" },
  { code: "UNOWNED_ACTIVE_WORK", label: "In-progress work stays with the outgoing owner", severity: "BLOCKER" },
  { code: "DECISION_NO_RATIONALE", label: "Decision without a recorded rationale", severity: "BLOCKER" },
  { code: "IMMINENT_UNDOCUMENTED", label: "Item due within 48h with no recent note", severity: "BLOCKER" },
  { code: "UNANSWERED_QUESTION", label: "Open question without a resolution", severity: "BLOCKER" },
  { code: "BLOCKED_NO_REASON", label: "Blocked item without a reason", severity: "BLOCKER" },
  { code: "MISSING_REQUIRED_DOC", label: "Required document missing for this case type", severity: "BLOCKER" },
  { code: "STALE_CONTEXT", label: "No new context in 14 days", severity: "WARNING" },
  { code: "OVERDUE_ITEMS", label: "Open items past their due date", severity: "WARNING" },
  { code: "DEADLINE_SOON", label: "Case deadline within 7 days", severity: "WARNING" },
  { code: "ORPHAN_DOC", label: "Document not referenced by any decision or action", severity: "WARNING" },
  { code: "THIN_HISTORY", label: "Fewer than 3 context items on an older case", severity: "WARNING" },
].map((r) => ({ ...r, weight: r.severity === "BLOCKER" ? BLOCKER_WEIGHT : WARNING_WEIGHT }));
