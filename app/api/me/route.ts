import { getSession } from "@/lib/google";
import { googleConfigured } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  const s = await getSession();
  return Response.json({
    googleConfigured: googleConfigured(),
    signedIn: !!s,
    email: s?.email,
    name: s?.name,
    picture: s?.picture,
  });
}
