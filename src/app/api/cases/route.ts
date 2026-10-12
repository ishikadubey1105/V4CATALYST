import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/authz";
import { forbidden, parseJson, route } from "@/lib/http";
import { appendLog } from "@/lib/audit";
import { CASE_TYPES, PRIORITIES } from "@/lib/domain";
import { getRules } from "@/lib/cases";
import { evaluate } from "@/lib/gate";

export const GET = route(async () => {
  const user = await requireUser();

  let where: Prisma.CaseWhereInput = {};
  if (user.role === "MANAGER") where = { team: user.team };
  else if (user.role === "MEMBER")
    where = {
      OR: [
        { currentOwnerId: user.id },
        { ownership: { some: { userId: user.id } } },
        { handoffs: { some: { OR: [{ fromUserId: user.id }, { toUserId: user.id }] } } },
        { actions: { some: { assigneeId: user.id } } },
      ],
    };

  const [cases, rules] = await Promise.all([
    db.case.findMany({
      where,
      orderBy: [{ status: "asc" }, { deadline: "asc" }],
      include: {
        currentOwner: { select: { id: true, name: true } },
        contextItems: true,
        decisions: true,
        actions: true,
        documents: { select: { id: true, filename: true, docClass: true } },
        handoffs: { where: { state: { in: ["DRAFT", "PENDING_ACCEPT"] } }, select: { id: true, state: true, toUserId: true } },
      },
    }),
    getRules(),
  ]);

  const now = new Date();
  return Response.json({
    cases: cases.map((c) => {
      const r = evaluate(c, rules, null, [], now);
      const openActions = c.actions.filter((a) => a.status !== "DONE");
      return {
        id: c.id,
        title: c.title,
        caseType: c.caseType,
        status: c.status,
        priority: c.priority,
        team: c.team,
        deadline: c.deadline,
        owner: c.currentOwner,
        openActions: openActions.length,
        overdueActions: openActions.filter((a) => a.dueDate && a.dueDate < now).length,
        // Counted per rule, not per finding: "2 warnings" means two rules raised.
        readiness: {
          score: r.score,
          blockers: new Set(r.blockers.map((b) => b.code)).size,
          warnings: new Set(r.warnings.map((w) => w.code)).size,
        },
        activeHandoff: c.handoffs[0] ?? null,
      };
    }),
  });
});

const Body = z.object({
  title: z.string().trim().min(3).max(160),
  summary: z.string().trim().max(5000).default(""),
  caseType: z.enum(CASE_TYPES),
  priority: z.enum(PRIORITIES).default("MEDIUM"),
  deadline: z.string().nullish(),
});

export const POST = route(async (req) => {
  const user = await requireUser();
  if (user.role === "AUDITOR") throw forbidden("Auditors have read-only access.");
  const body = await parseJson(req, Body);
  const now = new Date();

  const created = await db.$transaction(async (tx) => {
    const c = await tx.case.create({
      data: {
        title: body.title,
        summary: body.summary,
        caseType: body.caseType,
        priority: body.priority,
        deadline: body.deadline ? new Date(body.deadline) : null,
        team: user.team,
        currentOwnerId: user.id,
        createdById: user.id,
        createdAt: now,
      },
    });
    await tx.ownershipPeriod.create({ data: { caseId: c.id, userId: user.id, via: "CREATED", startedAt: now } });
    await appendLog(tx, {
      caseId: c.id,
      actorId: user.id,
      verb: "case.created",
      targetType: "Case",
      targetId: c.id,
      payload: { title: c.title, caseType: c.caseType, owner: user.id },
    });
    return c;
  });

  return Response.json({ case: created }, { status: 201 });
});
