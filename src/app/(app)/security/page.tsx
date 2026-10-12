import { redirect } from "next/navigation";
import { currentUser, visibleCasesWhere } from "@/lib/authz";
import { db } from "@/lib/db";
import { verifyChain } from "@/lib/audit";
import { sha256 } from "@/lib/canon";
import { parseWaivers } from "@/lib/cases";
import { SecurityDashboard, type SecurityData } from "./SecurityDashboard";

export const metadata = { title: "Security · Relay" };

// Everything on this page is scoped to the cases the viewer may see. Account
// lockouts are shown only to admins and auditors.
export default async function SecurityPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/security");

  const cases = await db.case.findMany({
    where: visibleCasesWhere(user),
    select: { id: true, title: true, team: true, logSeq: true, status: true },
    orderBy: { createdAt: "desc" },
  });
  const caseIds = cases.map((c) => c.id);

  const [chains, bypassRows, handoffs, users] = await Promise.all([
    Promise.all(cases.map(async (c) => ({ c, report: await verifyChain(c.id) }))),
    db.activityLog.findMany({ where: { caseId: { in: caseIds }, verb: "case.reassigned" }, orderBy: { createdAt: "desc" } }),
    db.handoff.findMany({ where: { caseId: { in: caseIds }, submittedAt: { not: null } }, orderBy: { submittedAt: "desc" }, include: { case: { select: { title: true } } } }),
    db.user.findMany({ select: { id: true, name: true, email: true, role: true, failedLogins: true, lockedUntil: true } }),
  ]);
  const name = Object.fromEntries(users.map((u) => [u.id, u.name]));
  const titleOf = Object.fromEntries(cases.map((c) => [c.id, c.title]));
  const now = new Date();
  const privileged = user.role === "ADMIN" || user.role === "AUDITOR";

  const data: SecurityData = {
    checkedAt: now.toISOString(),
    chains: chains.map(({ c, report }) => ({
      caseId: c.id,
      title: c.title,
      team: c.team,
      entries: report.entriesChecked,
      ok: report.ok,
      brokenAtSeq: report.ok ? null : report.brokenAtSeq,
      reason: report.ok ? null : report.reason,
      head: report.ok ? report.headHash : null,
    })),
    bypasses: bypassRows.map((b) => {
      const p = JSON.parse(b.payloadJson) as { to?: string; reason?: string; readinessAtBypass?: number };
      return { caseId: b.caseId, title: titleOf[b.caseId], by: name[b.actorId] ?? "Unknown", to: name[p.to ?? ""] ?? "Unknown", reason: p.reason ?? "", score: p.readinessAtBypass ?? null, at: b.createdAt.toISOString() };
    }),
    packages: handoffs.map((h) => ({
      handoffId: h.id,
      title: h.case.title,
      from: name[h.fromUserId] ?? "Unknown",
      to: name[h.toUserId] ?? "Unknown",
      state: h.state,
      score: h.readinessScore,
      intact: h.snapshotJson ? sha256(h.snapshotJson) === h.snapshotHash : false,
      waivers: parseWaivers(h.waiversJson).map((w) => ({ code: w.code, justification: w.justification, by: name[w.userId] ?? "Unknown" })),
      at: h.submittedAt!.toISOString(),
    })),
    accounts: privileged
      ? users
          .filter((u) => u.failedLogins > 0 || (u.lockedUntil && u.lockedUntil > now))
          .map((u) => ({ name: u.name, email: u.email, role: u.role, failed: u.failedLogins, lockedUntil: u.lockedUntil && u.lockedUntil > now ? u.lockedUntil.toISOString() : null }))
      : null,
  };

  return <SecurityDashboard data={data} />;
}
