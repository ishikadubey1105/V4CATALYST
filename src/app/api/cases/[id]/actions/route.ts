import { z } from "zod";
import { db } from "@/lib/db";
import { authorizeCase, requireUser } from "@/lib/authz";
import { badRequest, parseJson, route } from "@/lib/http";
import { appendLog } from "@/lib/audit";
import { ACTION_STATUSES } from "@/lib/domain";

const Body = z.object({
  title: z.string().trim().min(2).max(200),
  status: z.enum(ACTION_STATUSES).default("OPEN"),
  assigneeId: z.string().nullish(),
  dueDate: z.string().nullish(),
  blockedReason: z.string().trim().max(2000).nullish(),
  note: z.string().trim().max(5000).nullish(),
  refDocumentId: z.string().nullish(),
});

export const POST = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  await authorizeCase(user, id, "edit");
  const body = await parseJson(req, Body);
  if (body.status === "BLOCKED" && !body.blockedReason) throw badRequest("A blocked item needs a reason.");
  const now = new Date();
  const action = await db.$transaction(async (tx) => {
    const a = await tx.actionItem.create({
      data: {
        caseId: id,
        title: body.title,
        status: body.status,
        assigneeId: body.assigneeId || null,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        blockedReason: body.blockedReason || null,
        note: body.note || null,
        noteUpdatedAt: body.note ? now : null,
        refDocumentId: body.refDocumentId || null,
        createdAt: now,
      },
    });
    await appendLog(tx, {
      caseId: id,
      actorId: user.id,
      verb: "action.created",
      targetType: "ActionItem",
      targetId: a.id,
      payload: { title: a.title, status: a.status, assigneeId: a.assigneeId, dueDate: a.dueDate },
    });
    return a;
  });
  return Response.json({ action }, { status: 201 });
});
