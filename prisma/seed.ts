// Demo dataset. Dates are relative to run time, so the demo reads the same
// whenever it is presented. The Acme case is tuned to open the handoff gate at
// exactly 58% with 3 blockers and 2 warnings (see src/lib/gate.test.ts).

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import { db, type Tx } from "../src/lib/db";
import { appendLog } from "../src/lib/audit";
import { sha256 } from "../src/lib/canon";
import { DEFAULT_GATE_RULES } from "../src/lib/domain";
import { buildSnapshot, loadCaseFull, readinessFor, userNames } from "../src/lib/cases";
import { saveFile } from "../src/lib/storage";
import { makePdf } from "./pdf";

const DAY = 86_400_000;
const NOW = Date.now();
const ago = (days: number, hours = 0) => new Date(NOW - days * DAY - hours * 3_600_000);
const ahead = (days: number) => new Date(NOW + days * DAY);
export const DEMO_PASSWORD = "relay-demo";

async function reset() {
  await db.notification.deleteMany();
  await db.activityLog.deleteMany();
  await db.ownershipPeriod.deleteMany();
  await db.caseUpdate.deleteMany();
  await db.handoff.deleteMany();
  await db.document.deleteMany();
  await db.actionItem.deleteMany();
  await db.decision.deleteMany();
  await db.contextItem.deleteMany();
  await db.case.deleteMany();
  await db.user.deleteMany();
  await db.gateRule.deleteMany();
}

// Writers that mirror the API: every mutation appends to the chain, backdated.
function writers(tx: Tx, caseId: string) {
  return {
    async context(actorId: string, at: Date, kind: string, title: string, body: string, resolution?: { text: string; at: Date }) {
      const i = await tx.contextItem.create({
        data: { caseId, kind, title, body, authorId: actorId, createdAt: at },
      });
      await appendLog(tx, { caseId, actorId, verb: "context.added", targetType: "ContextItem", targetId: i.id, payload: { kind, title }, at });
      if (resolution) {
        await tx.contextItem.update({ where: { id: i.id }, data: { resolution: resolution.text, resolvedAt: resolution.at } });
        await appendLog(tx, { caseId, actorId, verb: "context.resolved", targetType: "ContextItem", targetId: i.id, payload: { title, resolution: resolution.text }, at: resolution.at });
      }
      return i;
    },
    async decision(actorId: string, at: Date, title: string, rationale: string, refDocumentId: string | null = null) {
      const d = await tx.decision.create({
        data: { caseId, title, rationale, decidedById: actorId, decidedAt: at, refDocumentId },
      });
      await appendLog(tx, { caseId, actorId, verb: "decision.recorded", targetType: "Decision", targetId: d.id, payload: { title, rationale }, at });
      return d;
    },
    async action(
      actorId: string,
      at: Date,
      a: { title: string; status?: string; assigneeId?: string | null; dueDate?: Date | null; note?: string; noteAt?: Date; blockedReason?: string; refDocumentId?: string },
    ) {
      const item = await tx.actionItem.create({
        data: {
          caseId,
          title: a.title,
          status: a.status ?? "OPEN",
          assigneeId: a.assigneeId ?? null,
          dueDate: a.dueDate ?? null,
          note: a.note ?? null,
          noteUpdatedAt: a.note ? (a.noteAt ?? at) : null,
          blockedReason: a.blockedReason ?? null,
          refDocumentId: a.refDocumentId ?? null,
          createdAt: at,
          completedAt: a.status === "DONE" ? at : null,
        },
      });
      await appendLog(tx, {
        caseId,
        actorId,
        verb: "action.created",
        targetType: "ActionItem",
        targetId: item.id,
        payload: { title: a.title, status: item.status, assigneeId: item.assigneeId, dueDate: item.dueDate },
        at,
      });
      return item;
    },
    async update(actorId: string, at: Date, kind: string, body: string) {
      const u = await tx.caseUpdate.create({ data: { caseId, kind, body, occurredAt: at, authorId: actorId, createdAt: at } });
      await appendLog(tx, { caseId, actorId, verb: "update.posted", targetType: "CaseUpdate", targetId: u.id, payload: { kind, body, occurredAt: at }, at });
      return u;
    },
    async document(actorId: string, at: Date, filename: string, docClass: string, title: string, lines: string[]) {
      const bytes = makePdf(title, lines);
      const storageKey = await saveFile(bytes, filename);
      const digest = sha256(bytes);
      const d = await tx.document.create({
        data: { caseId, filename, docClass, mimeType: "application/pdf", sizeBytes: bytes.length, storageKey, sha256: digest, uploadedById: actorId, uploadedAt: at },
      });
      await appendLog(tx, {
        caseId,
        actorId,
        verb: "document.attached",
        targetType: "Document",
        targetId: d.id,
        payload: { filename, docClass, sha256: digest, sizeBytes: bytes.length },
        at,
      });
      return d;
    },
  };
}

async function createCase(
  ownerId: string,
  at: Date,
  c: { title: string; summary: string; caseType: string; priority: string; team: string; deadline: Date | null },
) {
  return db.$transaction(async (tx) => {
    const created = await tx.case.create({
      data: { ...c, currentOwnerId: ownerId, createdById: ownerId, createdAt: at },
    });
    await tx.ownershipPeriod.create({ data: { caseId: created.id, userId: ownerId, via: "CREATED", startedAt: at } });
    await appendLog(tx, {
      caseId: created.id,
      actorId: ownerId,
      verb: "case.created",
      targetType: "Case",
      targetId: created.id,
      payload: { title: c.title, caseType: c.caseType, owner: ownerId },
      at,
    });
    return created;
  });
}

async function main() {
  await reset();
  await db.gateRule.createMany({ data: DEFAULT_GATE_RULES.map((r) => ({ ...r, enabled: true })) });

  const hash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const mk = (name: string, email: string, role: string, team: string, title: string) =>
    db.user.create({ data: { name, email, role, team, title, passwordHash: hash, createdAt: ago(200) } });

  const priya = await mk("Priya Nair", "priya@relay.demo", "MEMBER", "Customer Support", "Support Lead");
  const rahul = await mk("Rahul Verma", "rahul@relay.demo", "MEMBER", "Customer Support", "Senior Support Engineer");
  const kabir = await mk("Kabir Shah", "kabir@relay.demo", "MEMBER", "Customer Support", "Support Engineer");
  const anjali = await mk("Anjali Desai", "anjali@relay.demo", "MANAGER", "Customer Support", "Support Manager");
  await mk("Meera Iyer", "auditor@relay.demo", "AUDITOR", "Compliance", "Compliance Reviewer");
  await mk("Relay Admin", "admin@relay.demo", "ADMIN", "Operations", "Platform Administrator");

  // ── 1. Acme: the demo case. Opens the gate at 58%, 3 blockers, 2 warnings. ──
  const acme = await createCase(priya.id, ago(45), {
    title: "Acme Corp — billing dispute escalation",
    summary:
      "Acme Corp disputes ₹4.8L across three Q3 invoices, claiming the premium support tier was billed after they downgraded on 1 July. " +
      "Contract review shows the downgrade notice arrived late but inside the grace window. Finance agreed in principle to a goodwill credit; " +
      "the CFO wants a revised statement before their board meeting.",
    caseType: "BILLING_DISPUTE",
    priority: "HIGH",
    team: "Customer Support",
    deadline: ahead(5),
  });
  await db.$transaction(async (tx) => {
    const w = writers(tx, acme.id);
    await w.context(priya.id, ago(44), "BACKGROUND", "Downgrade timeline",
      "Acme emailed a downgrade request on 28 June. The CRM change was made on 9 July, so July–September invoices still carried premium support.");
    const emails = await w.document(priya.id, ago(43), "acme-email-thread.pdf", "CORRESPONDENCE", "Acme Corp — downgrade correspondence", [
      "28 Jun 2026  R. Kapoor (Acme AP) to support: please move us to Standard support from 1 July.",
      "02 Jul 2026  Support auto-reply: request logged as ticket 55120.",
      "09 Jul 2026  CRM tier changed to Standard by billing ops.",
      "14 Sep 2026  R. Kapoor: Q3 invoices still bill Premium. We dispute INR 4.8L.",
    ]);
    const contract = await w.document(priya.id, ago(40), "acme-msa-2025.pdf", "CONTRACT", "Master Services Agreement — Acme Corp", [
      "Clause 7.2  Tier changes take effect from the first day of the month after written notice.",
      "Clause 7.4  Notice received within 5 business days of month end is honoured for that month.",
      "Clause 11   Disputed amounts must be raised within 60 days of invoice date.",
    ]);
    await w.context(priya.id, ago(38), "STAKEHOLDER", "R. Kapoor, Head of AP at Acme",
      "Day-to-day contact. Responsive on email, prefers a written summary over calls. Escalates to the CFO if a promised date slips.");
    await w.decision(priya.id, ago(30), "Escalate disputed line items to Finance for review",
      "Clause 7.4 puts the notice inside the grace window, so Support cannot reject the claim alone. Finance owns credit decisions above ₹1L.", contract.id);
    await w.action(priya.id, ago(30), { title: "Log dispute in the billing system", status: "DONE", assigneeId: priya.id });
    await w.context(priya.id, ago(12), "CONSTRAINT", "Credit notes above ₹2L need Finance sign-off",
      "Any credit note above ₹2L must be countersigned by the Finance controller before it is sent.");
    await w.context(priya.id, ago(6), "OPEN_QUESTION", "Does the credit apply to the October invoice too?",
      "Acme asked whether the October invoice, already issued, falls under the same credit.",
      { text: "Yes. Finance confirmed October is covered; the credit note will reference all four invoices.", at: ago(3) });
    // Blocker: a decision recorded without its rationale.
    await w.decision(priya.id, ago(4), "Offer a 15% goodwill credit instead of a full refund", "", emails.id);
    await w.context(priya.id, ago(3), "RISK", "CFO board meeting on the 18th",
      "If the revised statement is not with the CFO before their board meeting, Acme has said it will withhold the Q4 payment.");
    // Blocker: in-progress work still assigned to the outgoing owner.
    await w.action(priya.id, ago(3), {
      title: "Draft credit note for the 15% goodwill credit",
      status: "IN_PROGRESS",
      assigneeId: priya.id,
      dueDate: ahead(4),
      note: "Draft 60% done in the billing system. Amount pending Finance confirmation of the October line.",
      noteAt: ago(1),
    });
    // Warning: two overdue items.
    await w.action(priya.id, ago(10), {
      title: "Get Finance sign-off on disputed line items",
      assigneeId: priya.id,
      dueDate: ago(2),
      note: "Chased the controller twice; promised by Friday.",
      noteAt: ago(1),
    });
    await w.action(priya.id, ago(8), { title: "Confirm Acme's credit limit with AP", assigneeId: priya.id, dueDate: ago(1), note: "Waiting on Acme AP.", noteAt: ago(2) });
    await w.action(priya.id, ago(2), { title: "Send revised statement to the Acme CFO", assigneeId: priya.id, dueDate: ahead(6) });
    // The running log of an ongoing dispute. Does not affect the gate.
    await w.update(priya.id, ago(14), "EVENT", "Acme AP formally disputed the Q3 invoices by email (ticket 55120 reopened).");
    await w.update(anjali.id, ago(9), "ESCALATION", "Acme's CFO copied our VP Sales on the dispute thread. Treat as high priority.");
    await w.update(priya.id, ago(5), "UPDATE", "Finance agreed in principle to a goodwill credit; amount still to be confirmed.");
    await w.update(anjali.id, ago(2, 3), "EVENT", "R. Kapoor called the support line asking for a status; told her the revised statement is coming this week.");
    await w.update(priya.id, ago(1), "UPDATE", "Chased the Finance controller again; sign-off promised by Friday.");
    // Blocker: no invoice attached on a billing dispute (the demo uploads demo-files/acme-invoice-INV-2291.pdf).
    await tx.notification.create({
      data: { userId: priya.id, kind: "action.overdue", caseId: acme.id, body: `"Get Finance sign-off on disputed line items" on "${acme.title}" is overdue.`, createdAt: ago(1) },
    });
  });
  await db.actionItem.updateMany({ where: { caseId: acme.id, dueDate: { lt: new Date() }, status: { not: "DONE" } }, data: { overdueNotifiedAt: ago(1) } });

  // ── 2. Northwind: a healthy case, to show the gate passing cleanly. ──
  const northwind = await createCase(priya.id, ago(20), {
    title: "Northwind — SSO rollout for 1,200 seats",
    summary:
      "Northwind is moving all 1,200 seats to Okta SSO. Pilot with 50 users finished cleanly; the remaining seats migrate in three waves. " +
      "Their IT lead owns the identity side, we own the tenant configuration and the cutover runbook.",
    caseType: "PROJECT",
    priority: "MEDIUM",
    team: "Customer Support",
    deadline: ahead(28),
  });
  await db.$transaction(async (tx) => {
    const w = writers(tx, northwind.id);
    await w.context(priya.id, ago(19), "BACKGROUND", "Why SSO now", "Northwind's auditors flagged shared local passwords in their annual review; SSO closes the finding.");
    await w.context(priya.id, ago(15), "STAKEHOLDER", "D. Mehta, IT lead at Northwind", "Owns Okta. Available Tuesdays and Thursdays for cutover calls.");
    await w.context(priya.id, ago(5), "CONSTRAINT", "No cutover during month-end close", "Finance users cannot be migrated in the last three business days of a month.");
    await w.decision(priya.id, ago(9), "Migrate in three waves of roughly 400 seats", "The pilot showed a 2% login-ticket rate; three waves keep peak ticket load inside one engineer's capacity.");
    await w.action(priya.id, ago(8), { title: "Wave 1 cutover (400 seats)", assigneeId: priya.id, dueDate: ahead(9), note: "Runbook reviewed with D. Mehta.", noteAt: ago(2) });
    await w.action(priya.id, ago(8), { title: "Wave 2 cutover (400 seats)", assigneeId: priya.id, dueDate: ahead(18) });
  });

  // ── 3. Globex: owned by Rahul after an accepted handoff from Kabir. ──
  const globex = await createCase(kabir.id, ago(18), {
    title: "Globex — P1 outage follow-up (3 Oct)",
    summary:
      "A misconfigured rate limiter caused a 47-minute API outage for Globex on 3 October. The RCA is published; three remediation items remain. " +
      "Globex is requesting a service credit under the SLA and a written assurance that the limiter change process now has a second reviewer.",
    caseType: "INCIDENT",
    priority: "CRITICAL",
    team: "Customer Support",
    deadline: ahead(12),
  });
  await db.$transaction(async (tx) => {
    const w = writers(tx, globex.id);
    await w.context(kabir.id, ago(18), "BACKGROUND", "What happened", "A limiter threshold was lowered from 5,000 to 500 rpm during a config push. Globex hit it within minutes.");
    const rca = await w.document(kabir.id, ago(15), "globex-rca-2026-10-03.pdf", "REPORT", "Incident report — Globex API outage, 3 Oct 2026", [
      "Impact: 47 minutes of HTTP 429 responses for Globex production traffic.",
      "Root cause: limiter threshold change shipped without a second reviewer.",
      "Remediation: (1) two-person review on limiter config, (2) synthetic canary, (3) SLA credit.",
    ]);
    await w.decision(kabir.id, ago(14), "Offer the full SLA credit for October", "47 minutes breaches the 99.9% monthly target; contesting it would cost more goodwill than the credit is worth.", rca.id);
    await w.context(kabir.id, ago(12), "STAKEHOLDER", "L. Fernandes, Globex VP Engineering", "Wants written confirmation of the two-person review rule before renewing.");
    await w.action(kabir.id, ago(12), { title: "Confirm two-person review is enforced in the config pipeline", status: "DONE", assigneeId: kabir.id });
    await w.action(kabir.id, ago(9), { title: "Issue October SLA credit", assigneeId: rahul.id, dueDate: ahead(7), note: "Credit amount approved.", noteAt: ago(3) });
    await w.action(kabir.id, ago(9), {
      title: "Ship synthetic canary for the limiter",
      status: "BLOCKED",
      assigneeId: rahul.id,
      dueDate: ahead(10),
      blockedReason: "Waiting on the platform team to expose a canary endpoint (ticket PLAT-812).",
    });
  });
  // Kabir moved teams; the case went to Rahul through the full gate.
  {
    const at = ago(8);
    const h = await db.handoff.create({
      data: { caseId: globex.id, fromUserId: kabir.id, toUserId: rahul.id, reason: "Kabir is moving to the Platform team.", initiatedAt: ago(9) },
    });
    const waivers = [{ code: "DEADLINE_SOON", justification: "Deadline is 4 days out at the time; Rahul has been shadowing this case since day one.", userId: kabir.id, at: at.toISOString() }];
    const [c, names, readiness] = await Promise.all([loadCaseFull(globex.id), userNames(), readinessFor(globex.id, rahul.id, waivers.map((w) => w.code))]);
    const snap = buildSnapshot(c, readiness, waivers, names, { fromUserId: kabir.id, toUserId: rahul.id, reason: h.reason, submittedAt: at });
    await db.$transaction(async (tx) => {
      await appendLog(tx, { caseId: globex.id, actorId: kabir.id, verb: "handoff.initiated", targetType: "Handoff", targetId: h.id, payload: { from: kabir.id, to: rahul.id, reason: h.reason }, at: ago(9) });
      await tx.handoff.update({
        where: { id: h.id },
        data: {
          state: "ACCEPTED",
          waiversJson: JSON.stringify(waivers),
          readinessScore: readiness.score,
          findingsJson: JSON.stringify(readiness),
          snapshotJson: snap.json,
          snapshotHash: snap.hash,
          submittedAt: at,
          respondedAt: ago(7, 20),
          responseNote: "Reviewed the RCA and the open items. Taking it from here.",
        },
      });
      await appendLog(tx, { caseId: globex.id, actorId: kabir.id, verb: "handoff.submitted", targetType: "Handoff", targetId: h.id, payload: { to: rahul.id, readinessScore: readiness.score, snapshotHash: snap.hash, waived: ["DEADLINE_SOON"] }, at });
      await tx.case.update({ where: { id: globex.id }, data: { currentOwnerId: rahul.id } });
      await tx.ownershipPeriod.updateMany({ where: { caseId: globex.id, endedAt: null }, data: { endedAt: ago(7, 20) } });
      await tx.ownershipPeriod.create({ data: { caseId: globex.id, userId: rahul.id, via: "HANDOFF", handoffId: h.id, startedAt: ago(7, 20) } });
      await appendLog(tx, { caseId: globex.id, actorId: rahul.id, verb: "handoff.accepted", targetType: "Handoff", targetId: h.id, payload: { from: kabir.id, acknowledgedSnapshotHash: snap.hash, note: "Reviewed the RCA and the open items. Taking it from here." }, at: ago(7, 20) });
    });
  }

  // ── 4. Initech: Kabir's case with gaps, visible to the manager. ──
  const initech = await createCase(kabir.id, ago(35), {
    title: "Initech — renewal escalation",
    summary: "Initech is threatening not to renew over response times.",
    caseType: "CUSTOMER_ESCALATION",
    priority: "HIGH",
    team: "Customer Support",
    deadline: ahead(15),
  });
  await db.$transaction(async (tx) => {
    const w = writers(tx, initech.id);
    await w.context(kabir.id, ago(34), "OPEN_QUESTION", "Who is the economic buyer now?", "Their previous sponsor left in August.");
    await w.action(kabir.id, ago(30), { title: "Schedule QBR with Initech", status: "BLOCKED", assigneeId: kabir.id, dueDate: ahead(3) });
  });

  // ── 5. Umbrella: a closed case, for history. ──
  const umbrella = await createCase(priya.id, ago(60), {
    title: "Umbrella Corp — refund backlog",
    summary: "Cleared a backlog of 34 delayed refunds for Umbrella Corp after a payment-gateway migration. All refunds issued and confirmed by their finance team.",
    caseType: "GENERAL",
    priority: "LOW",
    team: "Customer Support",
    deadline: null,
  });
  await db.$transaction(async (tx) => {
    const w = writers(tx, umbrella.id);
    await w.action(priya.id, ago(58), { title: "Issue all 34 refunds", status: "DONE", assigneeId: priya.id });
    await tx.case.update({ where: { id: umbrella.id }, data: { status: "CLOSED", closedAt: ago(40) } });
    await tx.ownershipPeriod.updateMany({ where: { caseId: umbrella.id }, data: { endedAt: ago(40) } });
    await appendLog(tx, { caseId: umbrella.id, actorId: priya.id, verb: "case.closed", targetType: "Case", targetId: umbrella.id, at: ago(40) });
  });

  // The file Priya uploads live during the demo to clear MISSING_REQUIRED_DOC.
  const demoDir = path.join(process.cwd(), "demo-files");
  await mkdir(demoDir, { recursive: true });
  await writeFile(
    path.join(demoDir, "acme-invoice-INV-2291.pdf"),
    makePdf("Invoice INV-2291 — Acme Corp", [
      "Period: July–September 2026",
      "Premium support tier   3 x INR 1,60,000   INR 4,80,000",
      "Disputed by customer on 14 Sep 2026 (see correspondence).",
    ]),
  );

  const r = await readinessFor(acme.id, rahul.id);
  console.log(`Seeded. Acme gate: ${r.score}% · ${r.blockers.length} blockers · ${r.warnings.length} warnings`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
