import { db } from "@/lib/db";
import { requireUser } from "@/lib/authz";
import { route } from "@/lib/http";

export const GET = route(async () => {
  const user = await requireUser();
  const [items, unread] = await Promise.all([
    db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  return Response.json({ items, unread });
});
