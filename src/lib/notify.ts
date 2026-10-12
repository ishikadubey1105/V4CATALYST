import type { Tx } from "./db";

export async function notify(
  tx: Tx,
  n: { userId: string; kind: string; body: string; caseId?: string; handoffId?: string },
) {
  await tx.notification.create({ data: { ...n, createdAt: new Date() } });
}
