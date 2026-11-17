import { cookies } from "next/headers";
import { authUrl } from "@/lib/google";
import { googleConfigured } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!googleConfigured()) return new Response("Google sign-in is not set up yet (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).", { status: 503 });
  const origin = new URL(req.url).origin;
  const state = crypto.randomUUID();
  (await cookies()).set("aj_oauth_state", state, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
  return Response.redirect(authUrl(origin, state));
}
