import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/authz";
import { route } from "@/lib/http";
import { PLAIN_COOKIE, SECURE_COOKIE } from "@/lib/session";

// Bumping sessionVersion revokes every token issued to this user, so a copied
// cookie stops working the moment its owner signs out.
export const POST = route(async () => {
  const user = await currentUser();
  if (user) await db.user.update({ where: { id: user.id }, data: { sessionVersion: { increment: 1 } } });
  const jar = await cookies();
  jar.delete(SECURE_COOKIE);
  jar.delete(PLAIN_COOKIE);
  return Response.json({ ok: true });
});
