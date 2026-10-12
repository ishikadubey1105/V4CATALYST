import { z } from "zod";
import { db } from "@/lib/db";
import { canEditCase, requireUser } from "@/lib/authz";
import { badRequest, conflict, forbidden, parseJson, route } from "@/lib/http";
import { appendLog } from "@/lib/audit";
import { loadHandoffFor } from "@/lib/handoffs";
import { parseWaivers, readinessFor, type Waiver } from "@/lib/cases";

const Body = z.union([
  z.object({
    code: z.string().min(1),
    justification: z.string().trim().min(20, "A waiver needs a justification of at least 20 characters.").max(1000),
  }),
  z.object({ code: z.string().min(1), remove: z.literal(true) }),
]);

export const POST = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  const h = await loadHandoffFor(user, id);
  if (!canEditCase(user, h.case)) throw forbidden();
  if (h.state !== "DRAFT") throw conflict("NOT_DRAFT", "Waivers can only change while the handoff is a draft.");
  const body = await parseJson(req, Body);

  let waivers = parseWaivers(h.waiversJson).filter((w) => w.code !== body.code);
  if (!("remove" in body)) {
    const readiness = await readinessFor(h.caseId, h.toUserId);
    if (readiness.blockers.some((b) => b.code === body.code)) throw badRequest("Blockers cannot be waived. Fix them.");
    if (!readiness.warnings.some((w) => w.code === body.code)) throw badRequest("That warning is not currently raised.");
    const waiver: Waiver = { code: body.code, justification: body.justification, userId: user.id, at: new Date().toISOString() };
    waivers = [...waivers, waiver];
  }

  await db.$transaction(async (tx) => {
    await tx.handoff.update({ where: { id }, data: { waiversJson: JSON.stringify(waivers) } });
    await appendLog(tx, {
      caseId: h.caseId,
      actorId: user.id,
      verb: "remove" in body ? "handoff.waiver_withdrawn" : "handoff.warning_waived",
      targetType: "Handoff",
      targetId: id,
      payload: "remove" in body ? { code: body.code } : { code: body.code, justification: body.justification },
    });
  });
  return Response.json({ waivers });
});
