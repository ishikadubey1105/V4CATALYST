import { z } from "zod";
import { db } from "@/lib/db";
import { authorizeCase, requireUser } from "@/lib/authz";
import { notFound, parseJson, route } from "@/lib/http";
import { appendLog } from "@/lib/audit";

const Patch = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  rationale: z.string().trim().max(5000).optional(),
  refDocumentId: z.string().nullish(),
});

export const PATCH = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  const d = await db.decision.findUnique({ where: { id } });
  if (!d) throw notFound("Decision");
  await authorizeCase(user, d.caseId, "edit");
  const body = await parseJson(req, Patch);
  const data = {
    ...(body.title !== undefined && { title: body.title }),
    ...(body.rationale !== undefined && { rationale: body.rationale }),
    ...(body.refDocumentId !== undefined && { refDocumentId: body.refDocumentId || null }),
  };
  const updated = await db.$transaction(async (tx) => {
    const u = await tx.decision.update({ where: { id }, data });
    await appendLog(tx, {
      caseId: d.caseId,
      actorId: user.id,
      verb: "decision.updated",
      targetType: "Decision",
      targetId: id,
      payload: { fields: Object.keys(data), title: u.title, rationale: u.rationale, previousRationale: d.rationale },
    });
    return u;
  });
  return Response.json({ decision: updated });
});
