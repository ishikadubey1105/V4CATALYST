import { db } from "@/lib/db";
import { canEditCase, requireUser } from "@/lib/authz";
import { conflict, forbidden, route } from "@/lib/http";
import { appendLog } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { loadHandoffFor } from "@/lib/handoffs";

export const POST = route(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  const h = await loadHandoffFor(user, id);
  if (!canEditCase(user, h.case)) throw forbidden();
  if (!["DRAFT", "PENDING_ACCEPT"].includes(h.state)) throw conflict("NOT_ACTIVE", "This handoff is already closed.");

  await db.$transaction(async (tx) => {
    const moved = await tx.handoff.updateMany({
      where: { id, state: h.state },
      data: { state: "CANCELLED", respondedAt: new Date() },
    });
    if (moved.count !== 1) throw conflict("NOT_ACTIVE", "This handoff changed state. Reload.");
    await tx.case.update({ where: { id: h.caseId }, data: { status: "ACTIVE" } });
    await appendLog(tx, { caseId: h.caseId, actorId: user.id, verb: "handoff.cancelled", targetType: "Handoff", targetId: id, payload: { previousState: h.state } });
    if (h.state === "PENDING_ACCEPT") {
      await notify(tx, { userId: h.toUserId, kind: "handoff.cancelled", caseId: h.caseId, body: `The handoff of "${h.case.title}" to you was withdrawn.` });
    }
  });
  return Response.json({ ok: true });
});
