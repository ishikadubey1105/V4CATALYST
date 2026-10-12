import { db } from "@/lib/db";
import { publicUser, requireUser } from "@/lib/authz";
import { route } from "@/lib/http";

// Directory for recipient and assignee pickers. Auditors are never assignable.
export const GET = route(async () => {
  await requireUser();
  const users = await db.user.findMany({ where: { role: { not: "AUDITOR" } }, orderBy: { name: "asc" } });
  return Response.json({ users: users.map(publicUser) });
});
