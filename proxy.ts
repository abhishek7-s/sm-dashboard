import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/token";

// Paths reachable without signing in. The Instagram webhook is called by Meta's
// servers, which never carry our session cookie.
const PUBLIC_PATHS = ["/login", "/api/instagram/webhook"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
  const isSignedIn = Boolean(
    verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value),
  );

  // /login itself redirects signed-in users (it can check the user still exists;
  // a valid token for a deleted user would otherwise loop between / and /login).
  if (isPublic) {
    return NextResponse.next();
  }

  if (!isSignedIn) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    const next = pathname + request.nextUrl.search;
    if (next !== "/") loginUrl.searchParams.set("next", next);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Everything except Next internals and the favicon. /uploads (WhatsApp media)
  // is deliberately included so private attachments need a session.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
