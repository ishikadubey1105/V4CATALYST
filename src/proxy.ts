import { NextResponse, type NextRequest } from "next/server";
import { readSessionToken, verifySession } from "@/lib/session";

// Page-level gate only: sends signed-out visitors to /login. Every API route
// still authenticates and authorises on its own; this is not access control.
export async function proxy(req: NextRequest) {
  const session = await verifySession(readSessionToken((n) => req.cookies.get(n)));
  const isLogin = req.nextUrl.pathname === "/login";
  if (!session && !isLogin) {
    const url = new URL("/login", req.url);
    if (req.nextUrl.pathname !== "/") url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }
  if (session && isLogin) return NextResponse.redirect(new URL("/", req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next|favicon.ico|.*\\..*).*)"],
};
