import { db } from "@/lib/db";
import { requireUser } from "@/lib/authz";
import { route } from "@/lib/http";

export const POST = route(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  // Scoped by userId: marking someone else's notification is a no-op.
  await db.notification.updateMany({ where: { id, userId: user.id, readAt: null }, data: { readAt: new Date() } });
  return Response.json({ ok: true });
});
