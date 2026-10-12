import { SignJWT, jwtVerify } from "jose";

// Kept free of database imports so proxy.ts can use it.

// Over HTTPS the cookie is Secure and carries the __Host- prefix: the browser
// refuses it unless it is Secure, host-only and path=/, so a sibling subdomain
// cannot plant or read it. Over plain HTTP (local runs, a LAN demo) a Secure
// cookie would be silently dropped and nobody could sign in, so the choice
// follows the actual request scheme, not the build mode.
export const SECURE_COOKIE = "__Host-relay_session";
export const PLAIN_COOKIE = "relay_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 12;

export function isHttps(req: Request): boolean {
  return req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https" || new URL(req.url).protocol === "https:";
}

export function sessionCookie(secure: boolean) {
  return {
    name: secure ? SECURE_COOKIE : PLAIN_COOKIE,
    options: { httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: SESSION_TTL_SECONDS },
  };
}

// Prefers the hardened cookie when both are present.
export function readSessionToken(get: (name: string) => { value: string } | undefined): string | undefined {
  return get(SECURE_COOKIE)?.value ?? get(PLAIN_COOKIE)?.value;
}

// `ver` is checked against User.sessionVersion on every API call, so signing
// out (which bumps the version) revokes every token issued before it.
export type SessionClaims = { sub: string; role: string; name: string; ver: number };

function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be set (32+ chars)");
  return new TextEncoder().encode(secret);
}

export async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT({ role: claims.role, name: claims.name, ver: claims.ver })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(key());
}

export async function verifySession(token: string | undefined): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    if (!payload.sub || typeof payload.ver !== "number") return null;
    return { sub: payload.sub, role: String(payload.role), name: String(payload.name), ver: payload.ver };
  } catch {
    return null;
  }
}
