import { cookies } from "next/headers";
import { cookieOptions, exchangeCode } from "@/lib/google";
import { isAllowed, seal, SESSION_COOKIE } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const jar = await cookies();
  const expected = jar.get("aj_oauth_state")?.value;
  jar.delete("aj_oauth_state");
  const code = url.searchParams.get("code");
  if (!code || !expected || url.searchParams.get("state") !== expected) {
    return Response.redirect(`${url.origin}/login?error=state`);
  }
  try {
    const session = await exchangeCode(code, url.origin);
    if (!isAllowed(session.email)) return Response.redirect(`${url.origin}/login?error=not_allowed`);
    jar.set(SESSION_COOKIE, await seal(session), { ...cookieOptions, secure: url.protocol === "https:" });
    return Response.redirect(`${url.origin}/`);
  } catch {
    return Response.redirect(`${url.origin}/login?error=google`);
  }
}
