import { getSession } from "@/lib/google";
import { runToolSafe } from "@/lib/tools";

export const runtime = "nodejs";
export const maxDuration = 60;

// Runs one tool for the live voice call (the call itself runs in the browser).
export async function POST(req: Request) {
  const { name, args, timeZone } = await req.json();
  const r = await runToolSafe(name, args, { session: await getSession(), timeZone: timeZone || "Asia/Kolkata" });
  return Response.json(r);
}
