import { getSession } from "@/lib/google";
import { runConfirmed } from "@/lib/tools";
import type { PendingAction } from "@/lib/types";

export const runtime = "nodejs";

// Ajay pressed "Yes" on a confirm card: do the calendar change now.
export async function POST(req: Request) {
  const { action, timeZone } = (await req.json()) as { action: PendingAction; timeZone?: string };
  try {
    const text = await runConfirmed(action, { session: await getSession(), timeZone: timeZone || "Asia/Kolkata" });
    return Response.json({ ok: true, text });
  } catch (e: any) {
    return Response.json({ ok: false, text: String(e?.message || e) }, { status: 400 });
  }
}
