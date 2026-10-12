import { cookies } from "next/headers";
import { route } from "@/lib/http";
import { SESSION_COOKIE } from "@/lib/session";

export const POST = route(async () => {
  (await cookies()).delete(SESSION_COOKIE);
  return Response.json({ ok: true });
});
