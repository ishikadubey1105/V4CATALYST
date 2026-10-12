import { db } from "@/lib/db";
import { authorizeCase, requireUser } from "@/lib/authz";
import { conflict, route } from "@/lib/http";
import { appendLog } from "@/lib/audit";

export const POST = route(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  const c = await authorizeCase(user, id, "close");
  if (c.status === "IN_HANDOFF") throw conflict("HANDOFF_PENDING", "Resolve the pending handoff before closing.");
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.case.update({ where: { id }, data: { status: "CLOSED", closedAt: now } });
    await tx.handoff.updateMany({ where: { caseId: id, state: "DRAFT" }, data: { state: "CANCELLED" } });
    await tx.ownershipPeriod.updateMany({ where: { caseId: id, endedAt: null }, data: { endedAt: now } });
    await appendLog(tx, { caseId: id, actorId: user.id, verb: "case.closed", targetType: "Case", targetId: id });
  });
  return Response.json({ ok: true });
});
