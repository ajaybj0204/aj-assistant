import { ai, withModelFallback } from "@/lib/gemini";
import { getSession, listEmails, listEvents } from "@/lib/google";
import { splitEmotion, systemPrompt } from "@/lib/prompts";
import { getWeather } from "@/lib/tools";
import type { Lang, Mood, UserContext } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

function dayBounds(timeZone: string) {
  const now = new Date();
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const off = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(now)
    .find((p) => p.type === "timeZoneName")!
    .value.replace("GMT", "") || "+00:00";
  return { start: `${ymd}T00:00:00${off}`, end: `${ymd}T23:59:59${off}` };
}

// Morning brief: today's meetings, important emails, to-dos and weather.
export async function POST(req: Request) {
  const b = (await req.json()) as { lang: Lang; mood: Mood; timeZone: string; context: UserContext };
  const tz = b.timeZone || "Asia/Kolkata";
  const session = await getSession();
  const facts: string[] = [];

  const { start, end } = dayBounds(tz);
  const [events, emails, weather] = await Promise.all([
    session ? listEvents(session, start, end).catch(() => null) : Promise.resolve(null),
    session ? listEmails(session, "in:inbox is:unread newer_than:1d -category:promotions -category:social", 8).catch(() => null) : Promise.resolve(null),
    b.context.city ? getWeather(b.context.city).catch(() => null) : Promise.resolve(null),
  ]);

  if (events) facts.push(events.length ? "Today's calendar:\n" + events.map((e) => `- ${e.start}: ${e.title}`).join("\n") : "Calendar: nothing scheduled today.");
  else facts.push("Calendar: Google not connected.");
  if (emails) facts.push(emails.length ? "Unread emails (last day):\n" + emails.map((e) => `- From ${e.from}: ${e.subject}`).join("\n") : "No new important emails.");
  const open = b.context.todos.filter((t) => !t.done);
  facts.push(open.length ? "Open to-dos:\n" + open.map((t) => `- ${t.text}${t.due ? ` (due ${t.due})` : ""}`).join("\n") : "No open to-dos.");
  if (weather) facts.push(`Weather in ${weather.place}: now ${weather.now.temp_c}°C, ${weather.now.sky}; today ${weather.today.min_c}-${weather.today.max_c}°C, ${weather.today.sky}, ${weather.today.rain_chance_percent}% chance of rain.`);
  const activeJobs = b.context.jobs.filter((j) => j.status === "applied" || j.status === "interview");
  if (activeJobs.length) facts.push("Active job applications:\n" + activeJobs.map((j) => `- ${j.company} (${j.role}): ${j.status}`).join("\n"));

  try {
    const res = await withModelFallback((model) =>
      ai().models.generateContent({
        model,
        contents: `Give Ajay his morning brief from these facts. Greet him warmly as Master, like you're happy to see him, then today's plan in a few short lines (meetings with times, important emails, to-dos, weather), and end with one encouraging line. Under 120 words. Only use these facts:\n\n${facts.join("\n\n")}`,
        config: { systemInstruction: systemPrompt({ lang: b.lang, mode: "assistant", mood: b.mood, timeZone: tz, context: b.context }) },
      }),
    );
    const { emotion, text } = splitEmotion(res.text || "");
    return Response.json({ text, emotion });
  } catch (e: any) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
