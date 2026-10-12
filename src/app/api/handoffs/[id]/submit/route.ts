import { db } from "@/lib/db";
import { canEditCase, requireUser } from "@/lib/authz";
import { conflict, forbidden, route } from "@/lib/http";
import { appendLog } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { loadHandoffFor } from "@/lib/handoffs";
import { buildSnapshot, getRules, loadCaseFull, parseWaivers, userNames } from "@/lib/cases";
import { evaluate } from "@/lib/gate";

export const POST = route(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  const h = await loadHandoffFor(user, id);
  if (!canEditCase(user, h.case)) throw forbidden();
  if (h.state !== "DRAFT") throw conflict("NOT_DRAFT", "Only a draft handoff can be submitted.");

  // Re-run the gate server-side. Never trust the score the client last saw.
  const waivers = parseWaivers(h.waiversJson);
  const [c, rules, names] = await Promise.all([loadCaseFull(h.caseId), getRules(), userNames()]);
  const readiness = evaluate(c, rules, h.toUserId, waivers.map((w) => w.code));

  if (readiness.blockers.length > 0) {
    throw conflict("BLOCKERS_STANDING", "Resolve every blocker before handing off.", {
      blockers: readiness.blockers.map((b) => b.code),
    });
  }
  const unaddressed = readiness.warnings.filter((w) => !w.waived);
  if (unaddressed.length > 0) {
    throw conflict("WARNINGS_UNADDRESSED", "Fix or waive every warning so the receiver knows what they inherit.", {
      warnings: [...new Set(unaddressed.map((w) => w.code))],
    });
  }

  const now = new Date();
  const snap = buildSnapshot(c, readiness, waivers, names, {
    fromUserId: h.fromUserId,
    toUserId: h.toUserId,
    reason: h.reason,
    submittedAt: now,
  });

  await db.$transaction(async (tx) => {
    // Guarded update: if two submits race, only one moves the draft.
    const moved = await tx.handoff.updateMany({
      where: { id, state: "DRAFT" },
      data: {
        state: "PENDING_ACCEPT",
        submittedAt: now,
        readinessScore: readiness.score,
        findingsJson: JSON.stringify(readiness),
        snapshotJson: snap.json,
        snapshotHash: snap.hash,
      },
    });
    if (moved.count !== 1) throw conflict("NOT_DRAFT", "This handoff was already submitted.");
    await tx.case.update({ where: { id: h.caseId }, data: { status: "IN_HANDOFF" } });
    await appendLog(tx, {
      caseId: h.caseId,
      actorId: user.id,
      verb: "handoff.submitted",
      targetType: "Handoff",
      targetId: id,
      payload: {
        to: h.toUserId,
        readinessScore: readiness.score,
        snapshotHash: snap.hash,
        waived: waivers.map((w) => w.code),
      },
    });
    await notify(tx, {
      userId: h.toUserId,
      kind: "handoff.received",
      caseId: h.caseId,
      handoffId: id,
      body: `${names[h.fromUserId] ?? "A colleague"} is handing you "${c.title}". Review the context package and accept.`,
    });
  });

  return Response.json({ ok: true, snapshotHash: snap.hash, score: readiness.score });
});
