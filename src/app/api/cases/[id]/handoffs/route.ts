import { z } from "zod";
import { db } from "@/lib/db";
import { authorizeCase, requireUser } from "@/lib/authz";
import { badRequest, conflict, parseJson, route } from "@/lib/http";
import { appendLog } from "@/lib/audit";
import { ACTIVE_HANDOFF_STATES } from "@/lib/handoffs";

const Body = z.object({
  toUserId: z.string().min(1, "Choose who receives the case."),
  reason: z.string().trim().min(5, "Say why the case is changing hands.").max(1000),
});

// Opens a DRAFT handoff, or retargets the existing draft. One active handoff per case.
export const POST = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  const c = await authorizeCase(user, id, "handoff");
  const { toUserId, reason } = await parseJson(req, Body);

  if (toUserId === c.currentOwnerId) throw badRequest("The recipient already owns this case.");
  const recipient = await db.user.findUnique({ where: { id: toUserId } });
  if (!recipient || recipient.role === "AUDITOR") throw badRequest("Choose a valid recipient.");

  const existing = await db.handoff.findFirst({ where: { caseId: id, state: { in: ACTIVE_HANDOFF_STATES } } });
  if (existing?.state === "PENDING_ACCEPT") {
    throw conflict("HANDOFF_PENDING", "A handoff on this case is already awaiting acceptance.", { handoffId: existing.id });
  }

  const handoff = await db.$transaction(async (tx) => {
    const h = existing
      ? await tx.handoff.update({ where: { id: existing.id }, data: { toUserId, reason } })
      : await tx.handoff.create({
          data: { caseId: id, fromUserId: c.currentOwnerId, toUserId, reason, initiatedAt: new Date() },
        });
    await appendLog(tx, {
      caseId: id,
      actorId: user.id,
      verb: existing ? "handoff.retargeted" : "handoff.initiated",
      targetType: "Handoff",
      targetId: h.id,
      payload: { from: h.fromUserId, to: toUserId, reason },
    });
    return h;
  });
  return Response.json({ handoff }, { status: existing ? 200 : 201 });
});
