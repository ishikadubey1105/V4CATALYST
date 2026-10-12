import { db } from "@/lib/db";
import { canEditCase, requireUser } from "@/lib/authz";
import { route } from "@/lib/http";
import { loadHandoffFor } from "@/lib/handoffs";
import { parseWaivers, readinessFor, userNames } from "@/lib/cases";
import { sha256 } from "@/lib/canon";

export const GET = route(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  const h = await loadHandoffFor(user, id);
  const waivers = parseWaivers(h.waiversJson);
  const names = await userNames();

  // A draft is evaluated live; a submitted handoff shows what was frozen.
  const readiness =
    h.state === "DRAFT"
      ? await readinessFor(h.caseId, h.toUserId, waivers.map((w) => w.code))
      : h.findingsJson
        ? JSON.parse(h.findingsJson)
        : null;

  const snapshot = h.snapshotJson ? JSON.parse(h.snapshotJson) : null;
  // Recompute so the page can show the snapshot still matches its recorded hash.
  const snapshotIntact = h.snapshotJson ? sha256(h.snapshotJson) === h.snapshotHash : null;

  const owner = await db.case.findUniqueOrThrow({ where: { id: h.caseId }, select: { title: true, currentOwnerId: true, team: true, status: true } });
  // What happened on the case after the package was frozen.
  const updatesSince = h.submittedAt
    ? await db.caseUpdate.findMany({ where: { caseId: h.caseId, createdAt: { gt: h.submittedAt } }, orderBy: { occurredAt: "desc" } })
    : [];
  return Response.json({
    handoff: { ...h, snapshotJson: undefined, findingsJson: undefined, case: undefined },
    case: { id: h.caseId, ...owner },
    readiness,
    waivers,
    snapshot,
    snapshotIntact,
    updatesSince,
    names,
    permissions: {
      manage: h.state === "DRAFT" && canEditCase(user, h.case),
      cancel: ["DRAFT", "PENDING_ACCEPT"].includes(h.state) && canEditCase(user, h.case),
      respond: h.state === "PENDING_ACCEPT" && h.toUserId === user.id,
    },
  });
});
