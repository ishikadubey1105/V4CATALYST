import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { HttpError, parseJson, route } from "@/lib/http";
import { isHttps, sessionCookie, signSession } from "@/lib/session";
import { publicUser } from "@/lib/authz";
import { clientIp, hit } from "@/lib/ratelimit";

const Body = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(200) });
const DUMMY_HASH = bcrypt.hashSync("relay-timing-equaliser", 12);

const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;

const badCredentials = () => new HttpError(401, "BAD_CREDENTIALS", "Email or password is incorrect.");

export const POST = route(async (req) => {
  const ip = hit(`login:${clientIp(req)}`, 50, 10 * 60_000);
  if (!ip.ok) {
    throw new HttpError(429, "RATE_LIMITED", `Too many sign-in attempts from this network. Try again in ${Math.ceil(ip.retryAfterSec / 60)} minutes.`);
  }

  const { email, password } = await parseJson(req, Body);
  const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  const now = new Date();

  if (user?.lockedUntil && user.lockedUntil > now) {
    const mins = Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 60_000);
    throw new HttpError(423, "ACCOUNT_LOCKED", `Too many failed attempts. This account is locked for ${mins} more minute${mins === 1 ? "" : "s"}.`);
  }

  // Always run bcrypt, even for unknown emails, so response time does not
  // reveal which accounts exist.
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    if (user) {
      const failures = user.failedLogins + 1;
      await db.user.update({
        where: { id: user.id },
        data:
          failures >= MAX_FAILURES
            ? { failedLogins: 0, lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000) }
            : { failedLogins: failures },
      });
    }
    throw badCredentials();
  }

  if (user.failedLogins > 0 || user.lockedUntil) {
    await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
  }
  const token = await signSession({ sub: user.id, role: user.role, name: user.name, ver: user.sessionVersion });
  const cookie = sessionCookie(isHttps(req));
  (await cookies()).set(cookie.name, token, cookie.options);
  return Response.json({ user: publicUser(user) });
});
