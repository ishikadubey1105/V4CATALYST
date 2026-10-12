import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/authz";
import { forbidden, route, unauthorized } from "@/lib/http";
import { notify } from "@/lib/notify";

function cronAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(header);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

// Flags past-due open actions once each and notifies the case owner and the
// assignee. Runs from Vercel Cron (bearer secret) or an admin clicking "Run".
async function sweep(req: Request) {
  if (!cronAuthorized(req)) {
    const user = await currentUser();
    if (!user) throw unauthorized();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") throw forbidden();
  }
  const now = new Date();
  const overdue = await db.actionItem.findMany({
    where: { status: { not: "DONE" }, dueDate: { lt: now }, overdueNotifiedAt: null, case: { status: { not: "CLOSED" } } },
    include: { case: { select: { id: true, title: true, currentOwnerId: true } } },
  });
  for (const a of overdue) {
    await db.$transaction(async (tx) => {
      await tx.actionItem.update({ where: { id: a.id }, data: { overdueNotifiedAt: now } });
      const recipients = new Set([a.case.currentOwnerId, a.assigneeId].filter(Boolean) as string[]);
      for (const userId of recipients) {
        await notify(tx, { userId, kind: "action.overdue", caseId: a.caseId, body: `"${a.title}" on "${a.case.title}" is overdue.` });
      }
    });
  }
  return Response.json({ flagged: overdue.length, at: now.toISOString() });
}

export const GET = route(sweep);
export const POST = route(sweep);
