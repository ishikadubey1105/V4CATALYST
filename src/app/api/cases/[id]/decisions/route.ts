import { z } from "zod";
import { db } from "@/lib/db";
import { authorizeCase, requireUser } from "@/lib/authz";
import { parseJson, route } from "@/lib/http";
import { appendLog } from "@/lib/audit";

const Body = z.object({
  title: z.string().trim().min(2).max(200),
  rationale: z.string().trim().min(10, "Record why this was decided (at least 10 characters).").max(5000),
  supersedesId: z.string().nullish(),
  refDocumentId: z.string().nullish(),
});

export const POST = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  await authorizeCase(user, id, "edit");
  const body = await parseJson(req, Body);
  const decision = await db.$transaction(async (tx) => {
    const d = await tx.decision.create({
      data: {
        caseId: id,
        title: body.title,
        rationale: body.rationale,
        supersedesId: body.supersedesId || null,
        refDocumentId: body.refDocumentId || null,
        decidedById: user.id,
        decidedAt: new Date(),
      },
    });
    await appendLog(tx, {
      caseId: id,
      actorId: user.id,
      verb: "decision.recorded",
      targetType: "Decision",
      targetId: d.id,
      payload: { title: d.title, rationale: d.rationale, supersedesId: d.supersedesId },
    });
    return d;
  });
  return Response.json({ decision }, { status: 201 });
});
