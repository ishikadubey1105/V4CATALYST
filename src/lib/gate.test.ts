import { describe, expect, it } from "vitest";
import { evaluate, type GateCase } from "./gate";
import { DEFAULT_GATE_RULES } from "./domain";

const NOW = new Date("2026-10-12T10:00:00Z");
const DAY = 86_400_000;
const ago = (d: number) => new Date(NOW.getTime() - d * DAY);
const ahead = (d: number) => new Date(NOW.getTime() + d * DAY);
const rules = DEFAULT_GATE_RULES.map((r) => ({ ...r, enabled: true }));

const PRIYA = "priya";
const RAHUL = "rahul";

// A case that passes every rule.
function cleanCase(): GateCase {
  return {
    id: "c1",
    summary: "x".repeat(150),
    caseType: "BILLING_DISPUTE",
    currentOwnerId: PRIYA,
    deadline: ahead(20),
    createdAt: ago(45),
    contextItems: [
      { id: "k1", kind: "BACKGROUND", title: "b", resolvedAt: null, createdAt: ago(2) },
      { id: "k2", kind: "STAKEHOLDER", title: "s", resolvedAt: null, createdAt: ago(10) },
      { id: "k3", kind: "OPEN_QUESTION", title: "q", resolvedAt: ago(1), createdAt: ago(5) },
    ],
    decisions: [{ id: "d1", title: "Refund", rationale: "Because", decidedAt: ago(3), refDocumentId: "doc1" }],
    actions: [
      { id: "a1", title: "Call", status: "OPEN", assigneeId: PRIYA, dueDate: ahead(10), blockedReason: null, noteUpdatedAt: null, refDocumentId: null },
    ],
    documents: [{ id: "doc1", filename: "invoice.pdf", docClass: "INVOICE" }],
  };
}

describe("evaluate", () => {
  it("scores a clean case at 100 and allows submission", () => {
    const r = evaluate(cleanCase(), rules, RAHUL, [], NOW);
    expect(r.score).toBe(100);
    expect(r.canSubmit).toBe(true);
    expect(r.blockers).toHaveLength(0);
    expect(r.warnings).toHaveLength(0);
  });

  it("produces the demo state: 3 blockers, 2 warnings, 58%", () => {
    const c = cleanCase();
    c.decisions[0].rationale = "";
    c.actions.push({ id: "a2", title: "Draft credit note", status: "IN_PROGRESS", assigneeId: PRIYA, dueDate: ahead(5), blockedReason: null, noteUpdatedAt: ago(1), refDocumentId: null });
    c.actions.push({ id: "a3", title: "Chase finance", status: "OPEN", assigneeId: PRIYA, dueDate: ago(2), blockedReason: null, noteUpdatedAt: ago(1), refDocumentId: null });
    // Correspondence is attached and referenced, but the required invoice is not.
    c.documents = [{ id: "doc2", filename: "emails.pdf", docClass: "CORRESPONDENCE" }];
    c.decisions[0].refDocumentId = "doc2";
    c.deadline = ahead(5);
    const r = evaluate(c, rules, RAHUL, [], NOW);
    expect(r.blockers.map((b) => b.code).sort()).toEqual(["DECISION_NO_RATIONALE", "MISSING_REQUIRED_DOC", "UNOWNED_ACTIVE_WORK"]);
    expect(r.warnings.map((w) => w.code).sort()).toEqual(["DEADLINE_SOON", "OVERDUE_ITEMS"]);
    expect(r.score).toBe(58);
    expect(r.canSubmit).toBe(false);
  });

  it("does not flag in-progress work already assigned to the recipient", () => {
    const c = cleanCase();
    c.actions.push({ id: "a2", title: "x", status: "IN_PROGRESS", assigneeId: RAHUL, dueDate: null, blockedReason: null, noteUpdatedAt: null, refDocumentId: null });
    expect(evaluate(c, rules, RAHUL, [], NOW).blockers).toHaveLength(0);
  });

  it("waivers raise the score but keep the warning visible", () => {
    const c = cleanCase();
    c.deadline = ahead(3);
    const before = evaluate(c, rules, RAHUL, [], NOW);
    const after = evaluate(c, rules, RAHUL, ["DEADLINE_SOON"], NOW);
    expect(after.score).toBeGreaterThan(before.score);
    expect(after.warnings).toHaveLength(1);
    expect(after.warnings[0].waived).toBe(true);
  });

  it("cannot waive a blocker", () => {
    const c = cleanCase();
    c.summary = "short";
    const r = evaluate(c, rules, RAHUL, ["NO_SUMMARY"], NOW);
    expect(r.canSubmit).toBe(false);
    expect(r.blockers[0].waived).toBe(false);
  });

  it("flags imminent items with no recent note", () => {
    const c = cleanCase();
    c.actions[0].dueDate = ahead(1);
    c.actions[0].noteUpdatedAt = ago(9);
    expect(evaluate(c, rules, RAHUL, [], NOW).blockers.map((b) => b.code)).toEqual(["IMMINENT_UNDOCUMENTED"]);
  });

  it("excludes inapplicable rules from the score", () => {
    const c = cleanCase();
    c.caseType = "GENERAL";
    c.documents = [];
    c.decisions[0].refDocumentId = null;
    const r = evaluate(c, rules, RAHUL, [], NOW);
    expect(r.rules.find((x) => x.code === "MISSING_REQUIRED_DOC")?.applicable).toBe(false);
    expect(r.score).toBe(100);
  });

  it("does not call a policy-required document an orphan", () => {
    const c = cleanCase();
    c.decisions[0].refDocumentId = null; // invoice no longer referenced
    expect(evaluate(c, rules, RAHUL, [], NOW).warnings).toHaveLength(0);
    c.documents.push({ id: "doc9", filename: "notes.pdf", docClass: "OTHER" });
    expect(evaluate(c, rules, RAHUL, [], NOW).warnings.map((w) => w.code)).toEqual(["ORPHAN_DOC"]);
  });

  it("links every finding to the field that fixes it", () => {
    const c = cleanCase();
    c.decisions[0].rationale = " ";
    const r = evaluate(c, rules, RAHUL, [], NOW);
    expect(r.blockers[0].fixPath).toBe("/cases/c1?tab=decisions&focus=d1");
  });
});
