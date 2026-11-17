import { NextResponse, type NextRequest } from "next/server";
import { googleConfigured, isAllowed, isLocalHost, SESSION_COOKIE, unseal } from "./lib/session";

// Only Ajay can use AJ. On localhost, before Google sign-in is set up, the app stays open for testing.
const PUBLIC = ["/login", "/api/auth/", "/manifest.webmanifest", "/sw.js", "/icons/", "/aj", "/.well-known/"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const local = isLocalHost(req.headers.get("host"));
  if (!googleConfigured()) {
    if (local) return NextResponse.next();
    return new NextResponse("AJ is locked: set up Google sign-in (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ALLOWED_EMAIL).", { status: 503 });
  }

  const session = await unseal(req.cookies.get(SESSION_COOKIE)?.value);
  if (session && isAllowed(session.email)) return NextResponse.next();
  // On localhost the app still opens without sign-in (Calendar and Gmail just stay off).
  if (local) return NextResponse.next();

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
