import { z } from "zod";
import { db } from "@/lib/db";
import { authorizeCase, requireUser } from "@/lib/authz";
import { notFound, parseJson, route } from "@/lib/http";
import { appendLog } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

const Patch = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  body: z.string().trim().max(5000).optional(),
  resolution: z.string().trim().max(5000).nullish(),
});

export const PATCH = route(async (req, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const item = await db.contextItem.findUnique({ where: { id } });
  if (!item) throw notFound("Context item");
  await authorizeCase(user, item.caseId, "edit");
  const body = await parseJson(req, Patch);

  const resolving = body.resolution !== undefined;
  const data = {
    ...(body.title !== undefined && { title: body.title }),
    ...(body.body !== undefined && { body: body.body }),
    ...(resolving && {
      resolution: body.resolution || null,
      resolvedAt: body.resolution ? new Date() : null,
    }),
  };
  const updated = await db.$transaction(async (tx) => {
    const i = await tx.contextItem.update({ where: { id }, data });
    await appendLog(tx, {
      caseId: item.caseId,
      actorId: user.id,
      verb: resolving && body.resolution ? "context.resolved" : "context.updated",
      targetType: "ContextItem",
      targetId: id,
      payload: { fields: Object.keys(data), title: i.title, resolution: i.resolution },
    });
    return i;
  });
  return Response.json({ item: updated });
});

export const DELETE = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const item = await db.contextItem.findUnique({ where: { id } });
  if (!item) throw notFound("Context item");
  await authorizeCase(user, item.caseId, "edit");
  await db.$transaction(async (tx) => {
    await tx.contextItem.delete({ where: { id } });
    // The removed content goes into the chain, so deletion never erases history.
    await appendLog(tx, {
      caseId: item.caseId,
      actorId: user.id,
      verb: "context.removed",
      targetType: "ContextItem",
      targetId: id,
      payload: { kind: item.kind, title: item.title, body: item.body },
    });
  });
  return Response.json({ ok: true });
});
