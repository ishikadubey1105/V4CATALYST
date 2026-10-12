import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/authz";
import { conflict, forbidden, parseJson, route } from "@/lib/http";
import { appendLog } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { loadHandoffFor } from "@/lib/handoffs";
import { sha256 } from "@/lib/canon";

const Body = z.object({
  note: z.string().trim().max(1000).optional(),
  // The hash the receiver was shown. Acceptance is an acknowledgement of that
  // exact package, so a mismatch is refused rather than silently accepted.
  snapshotHash: z.string().length(64),
});

export const POST = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  const h = await loadHandoffFor(user, id);
  if (h.toUserId !== user.id) throw forbidden("Only the recipient can accept this handoff.");
  if (h.state !== "PENDING_ACCEPT") throw conflict("NOT_PENDING", "This handoff is not awaiting acceptance.");
  const { note, snapshotHash } = await parseJson(req, Body);
  if (!h.snapshotJson || sha256(h.snapshotJson) !== h.snapshotHash) {
    throw conflict("SNAPSHOT_TAMPERED", "The context package no longer matches its recorded hash. Do not accept.");
  }
  if (snapshotHash !== h.snapshotHash) {
    throw conflict("SNAPSHOT_CHANGED", "The package changed since you opened it. Reload and review again.");
  }

  const now = new Date();
  await db.$transaction(async (tx) => {
    const moved = await tx.handoff.updateMany({
      where: { id, state: "PENDING_ACCEPT" },
      data: { state: "ACCEPTED", respondedAt: now, responseNote: note || null },
    });
    if (moved.count !== 1) throw conflict("NOT_PENDING", "This handoff was already answered.");
    await tx.case.update({ where: { id: h.caseId }, data: { currentOwnerId: user.id, status: "ACTIVE" } });
    await tx.ownershipPeriod.updateMany({ where: { caseId: h.caseId, endedAt: null }, data: { endedAt: now } });
    await tx.ownershipPeriod.create({
      data: { caseId: h.caseId, userId: user.id, via: "HANDOFF", handoffId: id, startedAt: now },
    });
    await appendLog(tx, {
      caseId: h.caseId,
      actorId: user.id,
      verb: "handoff.accepted",
      targetType: "Handoff",
      targetId: id,
      payload: { from: h.fromUserId, acknowledgedSnapshotHash: h.snapshotHash, note: note || null },
    });
    await notify(tx, {
      userId: h.fromUserId,
      kind: "handoff.accepted",
      caseId: h.caseId,
      handoffId: id,
      body: `${user.name} accepted "${h.case.title}". Responsibility has transferred.`,
    });
  });
  return Response.json({ ok: true });
});
