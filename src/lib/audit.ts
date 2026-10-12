import { db, type Tx } from "./db";
import { canonicalJson, chainHash, verifyEntries, type ChainReport } from "./canon";

export type LogInput = {
  caseId: string;
  actorId: string;
  verb: string;
  targetType: string;
  targetId?: string | null;
  payload?: Record<string, unknown>;
  at?: Date; // seed only: backdates demo history
};

// Must run inside the same transaction as the domain write it records.
// Advancing Case.logSeq takes the row's write lock, which serialises appends
// per case and keeps the chain linear under concurrent requests.
export async function appendLog(tx: Tx, input: LogInput) {
  const c = await tx.case.update({
    where: { id: input.caseId },
    data: { logSeq: { increment: 1 } },
    select: { logSeq: true, logHead: true },
  });
  const entry = {
    seq: c.logSeq,
    caseId: input.caseId,
    actorId: input.actorId,
    verb: input.verb,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    payloadJson: canonicalJson(input.payload ?? {}),
    createdAt: input.at ?? new Date(),
  };
  const hash = chainHash(c.logHead, entry);
  await tx.activityLog.create({ data: { ...entry, prevHash: c.logHead, hash } });
  await tx.case.update({ where: { id: input.caseId }, data: { logHead: hash } });
  return hash;
}

export async function verifyChain(caseId: string): Promise<ChainReport> {
  const [entries, c] = await Promise.all([
    db.activityLog.findMany({ where: { caseId }, orderBy: { seq: "asc" } }),
    db.case.findUniqueOrThrow({ where: { id: caseId }, select: { logHead: true, logSeq: true } }),
  ]);
  const report = verifyEntries(entries);
  if (!report.ok) return report;
  // Deleting the newest rows leaves an internally valid chain; the head stored
  // on the case catches that truncation.
  if (report.headHash !== c.logHead || report.entriesChecked !== c.logSeq) {
    return {
      ok: false,
      entriesChecked: report.entriesChecked,
      brokenAtSeq: report.entriesChecked + 1,
      reason: "HEAD_MISMATCH",
      expectedHash: c.logHead,
      foundHash: report.headHash,
    };
  }
  return report;
}
