import { requireUser } from "@/lib/authz";
import { route } from "@/lib/http";

export const GET = route(async () => {
  const user = await requireUser();
  return Response.json({ user });
});
