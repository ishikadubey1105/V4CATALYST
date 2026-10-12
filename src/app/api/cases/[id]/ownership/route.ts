import { db } from "@/lib/db";
import { authorizeCase, requireUser } from "@/lib/authz";
import { route } from "@/lib/http";
import { parseWaivers, userNames } from "@/lib/cases";

// The responsibility ledger: who owned the case, when, through which handoff,
// and what gaps were knowingly waived at each transfer.
export const GET = route(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  await authorizeCase(user, id, "view");
  const [periods, handoffs, names] = await Promise.all([
    db.ownershipPeriod.findMany({ where: { caseId: id }, orderBy: { startedAt: "asc" } }),
    db.handoff.findMany({ where: { caseId: id }, orderBy: { initiatedAt: "asc" } }),
    userNames(),
  ]);
  return Response.json({
    names,
    periods,
    handoffs: handoffs.map((h) => ({
      id: h.id,
      fromUserId: h.fromUserId,
      toUserId: h.toUserId,
      state: h.state,
      reason: h.reason,
      readinessScore: h.readinessScore,
      snapshotHash: h.snapshotHash,
      responseNote: h.responseNote,
      initiatedAt: h.initiatedAt,
      submittedAt: h.submittedAt,
      respondedAt: h.respondedAt,
      waivers: parseWaivers(h.waiversJson),
    })),
  });
});
