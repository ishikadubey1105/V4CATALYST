import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/authz";
import { conflict, forbidden, parseJson, route } from "@/lib/http";
import { appendLog } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { loadHandoffFor } from "@/lib/handoffs";

const Body = z.object({
  reason: z.string().trim().min(10, "Say what is missing (at least 10 characters).").max(1000),
});

export const POST = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  const h = await loadHandoffFor(user, id);
  if (h.toUserId !== user.id) throw forbidden("Only the recipient can reject this handoff.");
  if (h.state !== "PENDING_ACCEPT") throw conflict("NOT_PENDING", "This handoff is not awaiting acceptance.");
  const { reason } = await parseJson(req, Body);

  const now = new Date();
  await db.$transaction(async (tx) => {
    const moved = await tx.handoff.updateMany({
      where: { id, state: "PENDING_ACCEPT" },
      data: { state: "REJECTED", respondedAt: now, responseNote: reason },
    });
    if (moved.count !== 1) throw conflict("NOT_PENDING", "This handoff was already answered.");
    await tx.case.update({ where: { id: h.caseId }, data: { status: "ACTIVE" } });
    await appendLog(tx, {
      caseId: h.caseId,
      actorId: user.id,
      verb: "handoff.rejected",
      targetType: "Handoff",
      targetId: id,
      payload: { reason },
    });
    await notify(tx, {
      userId: h.fromUserId,
      kind: "handoff.rejected",
      caseId: h.caseId,
      handoffId: id,
      body: `${user.name} returned "${h.case.title}": ${reason}`,
    });
  });
  return Response.json({ ok: true });
});
