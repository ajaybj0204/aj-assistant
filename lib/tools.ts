// AJ's tools: what it can do, and the code that does it (server only).
import type { FunctionDeclaration } from "@google/genai";
import { ai, IMAGE_MODEL, withModelFallback } from "./gemini";
import {
  createDraft,
  createEvent,
  deleteEvent,
  listEmails,
  listEvents,
  readEmail,
  updateEvent,
} from "./google";
import type { Session } from "./session";
import type { Attachment, ClientAction, PendingAction } from "./types";

const str = (description: string) => ({ type: "string", description });

export const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "web_search",
    description: "Search the web for current information (news, prices, weather, facts, people, companies). Returns an answer with sources.",
    parametersJsonSchema: { type: "object", properties: { query: str("What to search for") }, required: ["query"] },
  },
  {
    name: "get_weather",
    description: "Current weather and today's/tomorrow's forecast for a city (free, always available). Use this for any weather question.",
    parametersJsonSchema: { type: "object", properties: { city: str("City name, e.g. Bengaluru") }, required: ["city"] },
  },
  {
    name: "generate_image",
    description: "Create an image from a description, or edit the image Ajay attached. Use for any request to make, draw, design or edit pictures.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        prompt: str("Detailed description of the image to create, in English"),
        aspect_ratio: { type: "string", enum: ["1:1", "16:9", "9:16", "4:3", "3:4"], description: "Default 1:1" },
        edit_attached_image: { type: "boolean", description: "True to edit/use the image Ajay attached" },
      },
      required: ["prompt"],
    },
  },
  {
    name: "calendar_list_events",
    description: "List events on Ajay's Google Calendar between two times.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        time_min: str("Start, ISO 8601 with offset"),
        time_max: str("End, ISO 8601 with offset"),
        query: str("Optional text to search for"),
      },
      required: ["time_min", "time_max"],
    },
  },
  {
    name: "calendar_create_event",
    description:
      "Create a calendar event. Set with_meet=true for a Google Meet link. If attendees are given, they get an email invite, so Ajay must confirm first (a confirm button is shown).",
    parametersJsonSchema: {
      type: "object",
      properties: {
        title: str("Event title"),
        start: str("Start, ISO 8601 with offset"),
        end: str("End, ISO 8601 with offset"),
        attendees: { type: "array", items: { type: "string" }, description: "Guest email addresses" },
        description: str("Optional notes"),
        with_meet: { type: "boolean", description: "Add a Google Meet video link" },
      },
      required: ["title", "start", "end"],
    },
  },
  {
    name: "calendar_update_event",
    description: "Move or rename an existing event (needs its id from calendar_list_events). Ajay confirms first.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        event_id: str("Event id"),
        current_title: str("The event's current title, for the confirm message"),
        title: str("New title (optional)"),
        start: str("New start, ISO 8601 with offset (optional)"),
        end: str("New end, ISO 8601 with offset (optional)"),
      },
      required: ["event_id", "current_title"],
    },
  },
  {
    name: "calendar_delete_event",
    description: "Cancel/delete an event (needs its id from calendar_list_events). Ajay confirms first.",
    parametersJsonSchema: {
      type: "object",
      properties: { event_id: str("Event id"), title: str("Event title, for the confirm message") },
      required: ["event_id", "title"],
    },
  },
  {
    name: "set_reminder",
    description: "Remind Ajay about something at a time. Creates a Google Calendar reminder that pops up on his phone and computer.",
    parametersJsonSchema: {
      type: "object",
      properties: { text: str("What to remind about"), at: str("When, ISO 8601 with offset") },
      required: ["text", "at"],
    },
  },
  {
    name: "todo_add",
    description: "Add an item to Ajay's to-do list.",
    parametersJsonSchema: {
      type: "object",
      properties: { text: str("The task"), due: str("Optional due date/time, ISO 8601") },
      required: ["text"],
    },
  },
  {
    name: "todo_done",
    description: "Mark a to-do as done (use the id from the open to-dos list).",
    parametersJsonSchema: { type: "object", properties: { id: str("To-do id") }, required: ["id"] },
  },
  {
    name: "save_contact",
    description: "Save or update a person in Ajay's contacts.",
    parametersJsonSchema: {
      type: "object",
      properties: { name: str("Name"), email: str("Email"), phone: str("Phone"), note: str("Who they are") },
      required: ["name"],
    },
  },
  {
    name: "remember",
    description: "Save a long-term fact about Ajay (preference, goal, important detail) so you remember it in future chats.",
    parametersJsonSchema: { type: "object", properties: { fact: str("The fact, one short sentence") }, required: ["fact"] },
  },
  {
    name: "job_update",
    description: "Add or update a job application in Ajay's job tracker.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        company: str("Company"),
        role: str("Job title"),
        status: { type: "string", enum: ["saved", "applied", "interview", "offer", "rejected"] },
        link: str("Job link"),
        note: str("Notes, e.g. interview date"),
      },
      required: ["company", "role", "status"],
    },
  },
  {
    name: "gmail_list",
    description: "List recent emails in Ajay's Gmail. Uses Gmail search syntax, e.g. 'is:unread newer_than:1d' or 'from:hr@company.com'.",
    parametersJsonSchema: {
      type: "object",
      properties: { query: str("Gmail search query, default 'in:inbox newer_than:2d'"), max: { type: "number", description: "Max emails, up to 20" } },
    },
  },
  {
    name: "gmail_read",
    description: "Read one email in full (id from gmail_list).",
    parametersJsonSchema: { type: "object", properties: { id: str("Email id") }, required: ["id"] },
  },
  {
    name: "gmail_draft",
    description: "Save an email draft in Ajay's Gmail. Never sends. For replies, pass reply_to_message_id and thread_id from gmail_read.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        to: str("Recipient email"),
        subject: str("Subject"),
        body: str("Email body, plain text"),
        reply_to_message_id: str("Message-ID header of the email being replied to"),
        thread_id: str("Thread id of the email being replied to"),
      },
      required: ["to", "subject", "body"],
    },
  },
];

export type ToolOutcome = {
  result: Record<string, unknown>;
  actions?: ClientAction[];
  confirm?: PendingAction;
  images?: string[];
  sources?: { title: string; url: string }[];
};

export type ToolContext = { session: Session | null; timeZone: string; attachments?: Attachment[] };

function fmtWhen(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-IN", { timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

const WMO: Record<number, string> = {
  0: "clear sky", 1: "mostly clear", 2: "partly cloudy", 3: "cloudy", 45: "fog", 48: "fog",
  51: "light drizzle", 53: "drizzle", 55: "heavy drizzle", 61: "light rain", 63: "rain", 65: "heavy rain",
  71: "light snow", 73: "snow", 75: "heavy snow", 80: "rain showers", 81: "rain showers", 82: "heavy showers",
  95: "thunderstorm", 96: "thunderstorm with hail", 99: "thunderstorm with hail",
};

/** Free weather from Open-Meteo (no API key). */
export async function getWeather(city: string) {
  const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name: city, count: "1" })}`).then((r) => r.json());
  const place = geo.results?.[0];
  if (!place) throw new Error(`Couldn't find the city "${city}"`);
  const p = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    timezone: "auto",
    forecast_days: "2",
  });
  const w = await fetch(`https://api.open-meteo.com/v1/forecast?${p}`).then((r) => r.json());
  const day = (i: number) => ({
    date: w.daily.time[i],
    sky: WMO[w.daily.weather_code[i]] || "mixed",
    min_c: w.daily.temperature_2m_min[i],
    max_c: w.daily.temperature_2m_max[i],
    rain_chance_percent: w.daily.precipitation_probability_max[i],
  });
  return {
    place: `${place.name}${place.admin1 ? ", " + place.admin1 : ""}`,
    now: {
      temp_c: w.current.temperature_2m,
      feels_like_c: w.current.apparent_temperature,
      humidity_percent: w.current.relative_humidity_2m,
      sky: WMO[w.current.weather_code] || "mixed",
      wind_kmh: w.current.wind_speed_10m,
    },
    today: day(0),
    tomorrow: day(1),
    source: "Open-Meteo",
  };
}

/** Free web search via Tavily (1,000 searches/month free) when TAVILY_API_KEY is set. */
async function tavilySearch(query: string) {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.TAVILY_API_KEY}` },
    body: JSON.stringify({ query, max_results: 5, include_answer: "basic", search_depth: "basic", topic: "general" }),
    signal: AbortSignal.timeout(25_000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Search failed: ${j?.detail?.error || j?.error || res.status}`);
  const results = (j.results || []) as { title: string; url: string; content: string }[];
  return {
    answer: [j.answer, ...results.map((r, i) => `[${i + 1}] ${r.title}: ${r.content}`)].filter(Boolean).join("\n").slice(0, 6000),
    sources: results.map((r) => ({ title: r.title, url: r.url })),
  };
}

export async function webSearch(query: string) {
  if (process.env.TAVILY_API_KEY) return tavilySearch(query);
  const res = await withModelFallback((model) =>
    ai().models.generateContent({
      model,
      contents: query,
      config: { tools: [{ googleSearch: {} }], systemInstruction: "Answer concisely with the key facts and dates. Today is " + new Date().toDateString() + "." },
    }),
  );
  const chunks = res.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const sources = chunks
    .map((c: any) => ({ title: c.web?.title || c.web?.uri || "source", url: c.web?.uri }))
    .filter((s: any) => s.url)
    .slice(0, 6);
  return { answer: res.text || "", sources };
}

const SIZES: Record<string, [number, number]> = {
  "1:1": [1024, 1024],
  "16:9": [1344, 768],
  "9:16": [768, 1344],
  "4:3": [1152, 864],
  "3:4": [864, 1152],
};

/** Free image making (Pollinations, no key). Safe mode on, and never posted to their public feed. */
async function pollinationsImage(prompt: string, aspect = "1:1"): Promise<string> {
  const [width, height] = SIZES[aspect] || SIZES["1:1"];
  const q = new URLSearchParams({
    width: String(width),
    height: String(height),
    model: "flux",
    seed: String(Math.floor(Math.random() * 1e6)),
    nologo: "true",
    nofeed: "true",
    private: "true",
    safe: "true",
  });
  const urls = [
    `https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}?${q}`,
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${q}`,
  ];
  let last = "";
  for (const url of urls) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(45_000) });
        const type = res.headers.get("content-type") || "";
        if (res.ok && type.startsWith("image/")) {
          const b64 = Buffer.from(await res.arrayBuffer()).toString("base64");
          return `data:${type.split(";")[0]};base64,${b64}`;
        }
        last = `${res.status} ${(await res.text()).slice(0, 120)}`;
      } catch (e: any) {
        last = String(e?.message || e);
      }
      await new Promise((r) => setTimeout(r, 2500));
    }
  }
  throw new Error(`Free image service is busy (${last}). Try again in a minute.`);
}

async function generateImage(args: any, ctx: ToolContext): Promise<string[]> {
  // Google's image model needs billing; without it (or if it fails) use the free service.
  if (process.env.IMAGE_PROVIDER !== "gemini") {
    return [await pollinationsImage(args.prompt, args.aspect_ratio)];
  }
  try {
    const out = await geminiImage(args, ctx);
    if (out.length) return out;
  } catch {}
  return [await pollinationsImage(args.prompt, args.aspect_ratio)];
}

async function geminiImage(args: any, ctx: ToolContext): Promise<string[]> {
  const parts: any[] = [{ text: args.prompt }];
  if (args.edit_attached_image) {
    for (const a of ctx.attachments || []) {
      if (a.mimeType.startsWith("image/")) parts.push({ inlineData: { mimeType: a.mimeType, data: a.data } });
    }
  }
  const res = await ai().models.generateContent({
    model: IMAGE_MODEL,
    contents: [{ role: "user", parts }],
    config: { responseModalities: ["IMAGE", "TEXT"], imageConfig: { aspectRatio: args.aspect_ratio || "1:1" } } as any,
  });
  const out: string[] = [];
  for (const p of res.candidates?.[0]?.content?.parts || []) {
    if (p.inlineData?.data) out.push(`data:${p.inlineData.mimeType || "image/png"};base64,${p.inlineData.data}`);
  }
  return out;
}

/** Runs a confirmed calendar action (after Ajay pressed Yes). */
export async function runConfirmed(action: PendingAction, ctx: ToolContext): Promise<string> {
  const a = action.args;
  if (action.tool === "calendar_create_event") {
    const e = await createEvent(ctx.session, {
      title: a.title,
      start: a.start,
      end: a.end,
      timeZone: ctx.timeZone,
      attendees: a.attendees,
      description: a.description,
      withMeet: !!a.with_meet,
    });
    return `Scheduled "${e.title}" on ${fmtWhen(e.start, ctx.timeZone)}.${e.meetLink ? ` Meet link: ${e.meetLink}` : ""}${e.attendees?.length ? ` Invites sent to ${e.attendees.join(", ")}.` : ""}`;
  }
  if (action.tool === "calendar_update_event") {
    const e = await updateEvent(ctx.session, { eventId: a.event_id, title: a.title, start: a.start, end: a.end, timeZone: ctx.timeZone });
    return `Updated "${e.title}", now on ${fmtWhen(e.start, ctx.timeZone)}.`;
  }
  if (action.tool === "calendar_delete_event") {
    await deleteEvent(ctx.session, a.event_id);
    return `Cancelled "${a.title}".`;
  }
  throw new Error("Unknown action");
}

export async function runTool(name: string, args: any, ctx: ToolContext): Promise<ToolOutcome> {
  switch (name) {
    case "get_weather":
      return { result: await getWeather(args.city) };
    case "web_search": {
      let r;
      try {
        r = await webSearch(args.query);
      } catch (e: any) {
        const quota = /quota|billing|429|RESOURCE_EXHAUSTED/i.test(String(e?.message));
        return {
          result: {
            error: quota
              ? "Web search is not set up yet (needs a free Tavily key in settings, or Gemini billing). Tell Ajay honestly you can't search the web right now. Do NOT guess current facts."
              : `Search failed: ${e?.message}. Do NOT guess current facts.`,
          },
        };
      }
      return { result: { answer: r.answer, sources: r.sources.map((s) => s.url) }, sources: r.sources };
    }
    case "generate_image": {
      const images = await generateImage(args, ctx);
      return {
        result: images.length
          ? { ok: true, images_created: images.length, note: "The images are shown to Ajay below your message." }
          : { ok: false, error: "No image was produced. Try rephrasing." },
        images,
      };
    }
    case "calendar_list_events":
      return { result: { events: await listEvents(ctx.session, args.time_min, args.time_max, args.query) } };
    case "calendar_create_event": {
      if (args.attendees?.length) {
        const confirm: PendingAction = {
          id: crypto.randomUUID(),
          tool: "calendar_create_event",
          args,
          summary: `Schedule "${args.title}" on ${fmtWhen(args.start, ctx.timeZone)} with ${args.attendees.join(", ")}${args.with_meet ? " (Google Meet)" : ""}`,
          status: "pending",
        };
        return { result: { status: "waiting_for_ajay_confirmation", note: "A confirm button is shown to Ajay. Invites go out only after he presses it." }, confirm };
      }
      const e = await createEvent(ctx.session, {
        title: args.title,
        start: args.start,
        end: args.end,
        timeZone: ctx.timeZone,
        description: args.description,
        withMeet: !!args.with_meet,
      });
      return { result: { created: e } };
    }
    case "calendar_update_event":
      return {
        result: { status: "waiting_for_ajay_confirmation" },
        confirm: {
          id: crypto.randomUUID(),
          tool: "calendar_update_event",
          args,
          summary: `Change "${args.current_title}"${args.start ? ` to ${fmtWhen(args.start, ctx.timeZone)}` : ""}${args.title ? `, new title "${args.title}"` : ""}`,
          status: "pending",
        },
      };
    case "calendar_delete_event":
      return {
        result: { status: "waiting_for_ajay_confirmation" },
        confirm: { id: crypto.randomUUID(), tool: "calendar_delete_event", args, summary: `Cancel "${args.title}"`, status: "pending" },
      };
    case "set_reminder": {
      if (!ctx.session) {
        // No Google account yet: keep it as a to-do with a due time instead.
        return {
          result: { ok: true, note: "Google is not connected, so it was saved as a to-do with a due time (no pop-up). Suggest connecting Google in Settings." },
          actions: [{ type: "todo.add", text: args.text, due: args.at }],
        };
      }
      const end = new Date(new Date(args.at).getTime() + 15 * 60_000).toISOString();
      const e = await createEvent(ctx.session, { title: `⏰ ${args.text}`, start: args.at, end, timeZone: ctx.timeZone, reminderMinutes: 0 });
      return { result: { ok: true, reminder_at: e.start } };
    }
    case "todo_add":
      return { result: { ok: true }, actions: [{ type: "todo.add", text: args.text, due: args.due }] };
    case "todo_done":
      return { result: { ok: true }, actions: [{ type: "todo.done", id: args.id }] };
    case "save_contact":
      return { result: { ok: true }, actions: [{ type: "contact.upsert", name: args.name, email: args.email, phone: args.phone, note: args.note }] };
    case "remember":
      return { result: { ok: true }, actions: [{ type: "memory.add", text: args.fact }] };
    case "job_update":
      return {
        result: { ok: true },
        actions: [{ type: "job.upsert", company: args.company, role: args.role, status: args.status, link: args.link, note: args.note }],
      };
    case "gmail_list":
      return { result: { emails: await listEmails(ctx.session, args.query || "in:inbox newer_than:2d", args.max || 10) } };
    case "gmail_read":
      return { result: { email: await readEmail(ctx.session, args.id) } };
    case "gmail_draft":
      return {
        result: await createDraft(ctx.session, {
          to: args.to,
          subject: args.subject,
          body: args.body,
          replyToMessageId: args.reply_to_message_id,
          threadId: args.thread_id,
        }),
      };
    default:
      return { result: { error: `Unknown tool ${name}` } };
  }
}

/** Safe wrapper: tool errors go back to AJ as text instead of crashing the chat. */
export async function runToolSafe(name: string, args: any, ctx: ToolContext): Promise<ToolOutcome> {
  try {
    return await runTool(name, args || {}, ctx);
  } catch (e: any) {
    return { result: { error: String(e?.message || e) } };
  }
}
