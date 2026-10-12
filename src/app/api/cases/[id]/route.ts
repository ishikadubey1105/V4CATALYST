import { z } from "zod";
import { db } from "@/lib/db";
import { authorizeCase, canEditCase, requireUser } from "@/lib/authz";
import { parseJson, route } from "@/lib/http";
import { appendLog } from "@/lib/audit";
import { PRIORITIES } from "@/lib/domain";
import { getRules, loadCaseFull, parseWaivers, userNames } from "@/lib/cases";
import { evaluate } from "@/lib/gate";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  await authorizeCase(user, id, "view");
  const [c, rules, names] = await Promise.all([loadCaseFull(id), getRules(), userNames()]);
  // While a draft handoff is open, evaluate against its recipient and waivers so
  // the score here matches the wizard as the owner fixes findings.
  const draft = c.handoffs.find((h) => h.state === "DRAFT") ?? null;
  const pending = c.handoffs.find((h) => h.state === "PENDING_ACCEPT") ?? null;
  const readiness = evaluate(
    c,
    rules,
    draft?.toUserId ?? null,
    draft ? parseWaivers(draft.waiversJson).map((w) => w.code) : [],
  );
  const editable = canEditCase(user, c) && c.status !== "IN_HANDOFF";
  const canManage = user.role === "ADMIN" || (user.role === "MANAGER" && user.team === c.team);
  return Response.json({
    case: {
      ...c,
      // Snapshots and frozen findings can be large; the handoff endpoint serves them.
      handoffs: c.handoffs.map((h) => ({ ...h, snapshotJson: undefined, findingsJson: undefined })),
    },
    activeHandoff: draft
      ? { id: draft.id, state: draft.state, toUserId: draft.toUserId }
      : pending
        ? { id: pending.id, state: pending.state, toUserId: pending.toUserId }
        : null,
    names,
    readiness,
    permissions: {
      edit: editable,
      handoff: canEditCase(user, c),
      reassign: canManage && c.status !== "CLOSED",
      isOwner: c.currentOwnerId === user.id,
    },
  });
});

const Patch = z.object({
  title: z.string().trim().min(3).max(160).optional(),
  summary: z.string().trim().max(5000).optional(),
  priority: z.enum(PRIORITIES).optional(),
  deadline: z.string().nullish(),
});

export const PATCH = route(async (req, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  await authorizeCase(user, id, "edit");
  const body = await parseJson(req, Patch);
  const data = {
    ...(body.title !== undefined && { title: body.title }),
    ...(body.summary !== undefined && { summary: body.summary }),
    ...(body.priority !== undefined && { priority: body.priority }),
    ...(body.deadline !== undefined && { deadline: body.deadline ? new Date(body.deadline) : null }),
  };
  const updated = await db.$transaction(async (tx) => {
    const c = await tx.case.update({ where: { id }, data });
    await appendLog(tx, {
      caseId: id,
      actorId: user.id,
      verb: "case.updated",
      targetType: "Case",
      targetId: id,
      payload: { fields: Object.keys(data), ...data },
    });
    return c;
  });
  return Response.json({ case: updated });
});
