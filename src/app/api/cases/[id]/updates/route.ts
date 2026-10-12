import { z } from "zod";
import { db } from "@/lib/db";
import { authorizeCase, requireUser } from "@/lib/authz";
import { badRequest, forbidden, parseJson, route } from "@/lib/http";
import { appendLog } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { UPDATE_KINDS, label } from "@/lib/domain";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  await authorizeCase(user, id, "view");
  const updates = await db.caseUpdate.findMany({ where: { caseId: id }, orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }] });
  return Response.json({ updates });
});

const Body = z.object({
  kind: z.enum(UPDATE_KINDS).default("UPDATE"),
  body: z.string().trim().min(3, "Write what happened.").max(2000),
  occurredAt: z.string().nullish(),
});

// Anyone who can see the case can post to its running log, auditors included:
// an entry is append-only and changes nothing else, so it does not breach the
// auditor's read-only access to case contents. Deliberately allowed while a
// handoff is pending: a live case keeps moving, and the receiver needs what
// happened after the package was frozen.
export const POST = route(async (req, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const c = await authorizeCase(user, id, "view");
  if (c.status === "CLOSED") throw forbidden("This case is closed.");
  const body = await parseJson(req, Body);

  const now = new Date();
  const occurredAt = body.occurredAt ? new Date(body.occurredAt) : now;
  if (Number.isNaN(occurredAt.getTime())) throw badRequest("That date is not valid.");
  if (occurredAt.getTime() > now.getTime() + 60_000) throw badRequest("An update cannot be dated in the future.");

  const update = await db.$transaction(async (tx) => {
    const u = await tx.caseUpdate.create({
      data: { caseId: id, kind: body.kind, body: body.body, occurredAt, authorId: user.id, createdAt: now },
    });
    await appendLog(tx, {
      caseId: id,
      actorId: user.id,
      verb: "update.posted",
      targetType: "CaseUpdate",
      targetId: u.id,
      payload: { kind: u.kind, body: u.body, occurredAt: u.occurredAt, authorRole: user.role },
    });

    // Tell the people carrying the case: owner, anyone receiving it, and
    // assignees of open work. Never the author.
    const [handoff, actions] = await Promise.all([
      tx.handoff.findFirst({ where: { caseId: id, state: { in: ["DRAFT", "PENDING_ACCEPT"] } }, select: { toUserId: true } }),
      tx.actionItem.findMany({ where: { caseId: id, status: { not: "DONE" }, assigneeId: { not: null } }, select: { assigneeId: true } }),
    ]);
    const recipients = new Set([c.currentOwnerId, handoff?.toUserId, ...actions.map((a) => a.assigneeId)].filter(Boolean) as string[]);
    recipients.delete(user.id);
    const snippet = u.body.length > 90 ? `${u.body.slice(0, 87)}…` : u.body;
    for (const userId of recipients) {
      await notify(tx, {
        userId,
        kind: "case.update",
        caseId: id,
        body: `${label(u.kind)} on "${c.title}" from ${user.name}: ${snippet}`,
      });
    }
    return u;
  });
  return Response.json({ update }, { status: 201 });
});
