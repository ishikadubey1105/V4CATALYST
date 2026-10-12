import { z } from "zod";
import { db } from "@/lib/db";
import { authorizeCase, requireUser } from "@/lib/authz";
import { badRequest, parseJson, route } from "@/lib/http";
import { appendLog } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { readinessFor } from "@/lib/cases";

const Body = z.object({
  toUserId: z.string().min(1),
  reason: z.string().trim().min(10, "Give a reason of at least 10 characters for bypassing the handoff gate."),
});

// Manager override: moves ownership without the gate. Recorded as a named
// bypass, with the readiness score at the moment it was skipped.
export const POST = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  const c = await authorizeCase(user, id, "reassign");
  const { toUserId, reason } = await parseJson(req, Body);
  if (toUserId === c.currentOwnerId) throw badRequest("That person already owns this case.");
  const target = await db.user.findUnique({ where: { id: toUserId } });
  if (!target || target.role === "AUDITOR") throw badRequest("Pick a valid new owner.");
  // A manager's override reaches only their own team's people.
  if (user.role !== "ADMIN" && target.team !== c.team) throw badRequest("A manager can only reassign within the case's team.");

  const readiness = await readinessFor(id, toUserId);
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.handoff.updateMany({
      where: { caseId: id, state: { in: ["DRAFT", "PENDING_ACCEPT"] } },
      data: { state: "CANCELLED", respondedAt: now, responseNote: "Superseded by manager reassignment" },
    });
    await tx.case.update({ where: { id }, data: { currentOwnerId: toUserId, status: "ACTIVE" } });
    await tx.ownershipPeriod.updateMany({ where: { caseId: id, endedAt: null }, data: { endedAt: now } });
    await tx.ownershipPeriod.create({ data: { caseId: id, userId: toUserId, via: "REASSIGN", note: reason, startedAt: now } });
    await appendLog(tx, {
      caseId: id,
      actorId: user.id,
      verb: "case.reassigned",
      targetType: "Case",
      targetId: id,
      payload: {
        from: c.currentOwnerId,
        to: toUserId,
        reason,
        gateBypassed: true,
        readinessAtBypass: readiness.score,
        standingBlockers: readiness.blockers.map((b) => b.code),
      },
    });
    for (const uid of [toUserId, c.currentOwnerId]) {
      await notify(tx, {
        userId: uid,
        kind: "case.reassigned",
        caseId: id,
        body: `${user.name} reassigned "${c.title}" ${uid === toUserId ? "to you" : "away from you"}: ${reason}`,
      });
    }
  });
  return Response.json({ ok: true });
});
