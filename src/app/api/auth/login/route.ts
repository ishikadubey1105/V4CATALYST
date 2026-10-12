import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { HttpError, parseJson, route } from "@/lib/http";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/session";
import { publicUser } from "@/lib/authz";

const Body = z.object({ email: z.string().email(), password: z.string().min(1) });
const DUMMY_HASH = bcrypt.hashSync("relay-timing-equaliser", 12);

export const POST = route(async (req) => {
  const { email, password } = await parseJson(req, Body);
  const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  // Compare against a dummy hash when the user is missing so response time
  // does not reveal which emails exist.
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, "BAD_CREDENTIALS", "Email or password is incorrect.");

  const token = await signSession({ sub: user.id, role: user.role, name: user.name });
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions);
  return Response.json({ user: publicUser(user) });
});
