import { z } from "zod";
import { db } from "@/lib/db";
import { authorizeCase, requireUser } from "@/lib/authz";
import { parseJson, route } from "@/lib/http";
import { appendLog } from "@/lib/audit";
import { CONTEXT_KINDS } from "@/lib/domain";

const Body = z.object({
  kind: z.enum(CONTEXT_KINDS),
  title: z.string().trim().min(2).max(200),
  body: z.string().trim().max(5000).default(""),
});

export const POST = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  await authorizeCase(user, id, "edit");
  const body = await parseJson(req, Body);
  const item = await db.$transaction(async (tx) => {
    const i = await tx.contextItem.create({ data: { ...body, caseId: id, authorId: user.id, createdAt: new Date() } });
    await appendLog(tx, {
      caseId: id,
      actorId: user.id,
      verb: "context.added",
      targetType: "ContextItem",
      targetId: i.id,
      payload: { kind: i.kind, title: i.title },
    });
    return i;
  });
  return Response.json({ item }, { status: 201 });
});
