import { db } from "@/lib/db";
import { requireUser } from "@/lib/authz";
import { route } from "@/lib/http";

export const POST = route(async () => {
  const user = await requireUser();
  await db.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  return Response.json({ ok: true });
});
