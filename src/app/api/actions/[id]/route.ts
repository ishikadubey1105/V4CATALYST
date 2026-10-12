import { z } from "zod";
import { db } from "@/lib/db";
import { canEditCase, canViewCase, requireUser } from "@/lib/authz";
import { badRequest, forbidden, notFound, parseJson, route } from "@/lib/http";
import { appendLog } from "@/lib/audit";
import { ACTION_STATUSES } from "@/lib/domain";
import { notify } from "@/lib/notify";

const Patch = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  status: z.enum(ACTION_STATUSES).optional(),
  assigneeId: z.string().nullish(),
  dueDate: z.string().nullish(),
  blockedReason: z.string().trim().max(2000).nullish(),
  note: z.string().trim().max(5000).nullish(),
  refDocumentId: z.string().nullish(),
});

// Fields an assignee may change on work assigned to them without owning the case.
const ASSIGNEE_FIELDS = new Set(["status", "note", "blockedReason"]);

export const PATCH = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  const a = await db.actionItem.findUnique({ where: { id }, include: { case: true } });
  if (!a) throw notFound("Action");
  if (!(await canViewCase(user, a.case))) throw notFound("Action");

  const body = await parseJson(req, Patch);
  const touched = Object.keys(body).filter((k) => body[k as keyof typeof body] !== undefined);
  const editor = canEditCase(user, a.case) && a.case.status !== "IN_HANDOFF";
  const assigneeOnly = a.assigneeId === user.id && a.case.status !== "CLOSED" && touched.every((k) => ASSIGNEE_FIELDS.has(k));
  if (!editor && !assigneeOnly) throw forbidden();

  const status = body.status ?? a.status;
  const blockedReason = body.blockedReason !== undefined ? body.blockedReason || null : a.blockedReason;
  if (status === "BLOCKED" && !blockedReason) throw badRequest("A blocked item needs a reason.");

  const now = new Date();
  const data = {
    ...(body.title !== undefined && { title: body.title }),
    ...(body.status !== undefined && { status: body.status, completedAt: body.status === "DONE" ? now : null }),
    ...(body.assigneeId !== undefined && { assigneeId: body.assigneeId || null }),
    ...(body.dueDate !== undefined && { dueDate: body.dueDate ? new Date(body.dueDate) : null, overdueNotifiedAt: null }),
    ...(body.blockedReason !== undefined && { blockedReason: body.blockedReason || null }),
    ...(body.note !== undefined && { note: body.note || null, noteUpdatedAt: now }),
    ...(body.refDocumentId !== undefined && { refDocumentId: body.refDocumentId || null }),
  };

  const updated = await db.$transaction(async (tx) => {
    const u = await tx.actionItem.update({ where: { id }, data });
    await appendLog(tx, {
      caseId: a.caseId,
      actorId: user.id,
      verb: body.status && body.status !== a.status ? "action.status_changed" : "action.updated",
      targetType: "ActionItem",
      targetId: id,
      payload: {
        title: u.title,
        fields: Object.keys(data),
        from: { status: a.status, assigneeId: a.assigneeId },
        to: { status: u.status, assigneeId: u.assigneeId },
      },
    });
    if (body.assigneeId && body.assigneeId !== a.assigneeId && body.assigneeId !== user.id) {
      await notify(tx, {
        userId: body.assigneeId,
        kind: "action.assigned",
        caseId: a.caseId,
        body: `${user.name} assigned you "${u.title}" on "${a.case.title}".`,
      });
    }
    return u;
  });
  return Response.json({ action: updated });
});
