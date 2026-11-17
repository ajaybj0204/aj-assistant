// Google sign-in plus Calendar and Gmail helpers (server only).
import { cookies, headers } from "next/headers";
import { SESSION_COOKIE, seal, unseal, type Session } from "./session";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
];

export function redirectUri(origin: string): string {
  return process.env.GOOGLE_REDIRECT_URI || `${origin}/api/auth/callback`;
}

export function authUrl(origin: string, state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number; error?: string };

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      ...body,
    }),
  });
  const json = (await res.json()) as TokenResponse;
  if (!res.ok || json.error) throw new Error(`Google token error: ${json.error || res.status}`);
  return json;
}

export async function exchangeCode(code: string, origin: string): Promise<Session> {
  const t = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri(origin) });
  const me = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${t.access_token}` },
  }).then((r) => r.json());
  return {
    email: me.email,
    name: me.name,
    picture: me.picture,
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresAt: Date.now() + t.expires_in * 1000,
  };
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};

/** Current signed-in session, refreshing the Google access token when it is about to expire. */
export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const s = await unseal(jar.get(SESSION_COOKIE)?.value);
  if (!s) return null;
  if (s.expiresAt - Date.now() > 60_000) return s;
  if (!s.refreshToken) return s;
  try {
    const t = await tokenRequest({ refresh_token: s.refreshToken, grant_type: "refresh_token" });
    const next: Session = { ...s, accessToken: t.access_token, expiresAt: Date.now() + t.expires_in * 1000 };
    const secure = (await headers()).get("x-forwarded-proto") === "https";
    jar.set(SESSION_COOKIE, await seal(next), { ...cookieOptions, secure });
    return next;
  } catch {
    return s;
  }
}

export class GoogleNotConnected extends Error {
  constructor() {
    super("Google account is not connected. Sign in with Google in Settings to use Calendar and Gmail.");
  }
}

export async function gfetch<T = any>(session: Session | null, url: string, init: RequestInit = {}): Promise<T> {
  if (!session) throw new GoogleNotConnected();
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${session.accessToken}`, "Content-Type": "application/json", ...init.headers },
  });
  if (res.status === 204) return {} as T;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || `Google API error ${res.status}`);
  return json as T;
}

// ---------- Calendar ----------

const CAL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export type CalEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  meetLink?: string;
  attendees?: string[];
  link?: string;
};

function simplify(e: any): CalEvent {
  return {
    id: e.id,
    title: e.summary || "(no title)",
    start: e.start?.dateTime || e.start?.date,
    end: e.end?.dateTime || e.end?.date,
    meetLink: e.hangoutLink,
    attendees: (e.attendees || []).map((a: any) => a.email),
    link: e.htmlLink,
  };
}

export async function listEvents(s: Session | null, timeMin: string, timeMax: string, query?: string) {
  const p = new URLSearchParams({ timeMin, timeMax, singleEvents: "true", orderBy: "startTime", maxResults: "50" });
  if (query) p.set("q", query);
  const json = await gfetch(s, `${CAL}?${p}`);
  return (json.items || []).map(simplify) as CalEvent[];
}

export async function createEvent(
  s: Session | null,
  a: { title: string; start: string; end: string; timeZone: string; attendees?: string[]; description?: string; withMeet?: boolean; reminderMinutes?: number },
) {
  const body: any = {
    summary: a.title,
    description: a.description,
    start: { dateTime: a.start, timeZone: a.timeZone },
    end: { dateTime: a.end, timeZone: a.timeZone },
    attendees: (a.attendees || []).map((email) => ({ email })),
  };
  if (a.withMeet) {
    body.conferenceData = { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } };
  }
  if (a.reminderMinutes !== undefined) {
    body.reminders = { useDefault: false, overrides: [{ method: "popup", minutes: a.reminderMinutes }] };
  }
  const p = new URLSearchParams({ conferenceDataVersion: "1", sendUpdates: a.attendees?.length ? "all" : "none" });
  return simplify(await gfetch(s, `${CAL}?${p}`, { method: "POST", body: JSON.stringify(body) }));
}

export async function updateEvent(
  s: Session | null,
  a: { eventId: string; title?: string; start?: string; end?: string; timeZone: string },
) {
  const body: any = {};
  if (a.title) body.summary = a.title;
  if (a.start) body.start = { dateTime: a.start, timeZone: a.timeZone };
  if (a.end) body.end = { dateTime: a.end, timeZone: a.timeZone };
  return simplify(
    await gfetch(s, `${CAL}/${encodeURIComponent(a.eventId)}?sendUpdates=all`, { method: "PATCH", body: JSON.stringify(body) }),
  );
}

export async function deleteEvent(s: Session | null, eventId: string) {
  await gfetch(s, `${CAL}/${encodeURIComponent(eventId)}?sendUpdates=all`, { method: "DELETE" });
  return { deleted: true };
}

// ---------- Gmail ----------

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

function header(msg: any, name: string): string {
  return msg.payload?.headers?.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
}

function decodeB64url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function bodyText(part: any): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) return decodeB64url(part.body.data);
  for (const p of part.parts || []) {
    const t = bodyText(p);
    if (t) return t;
  }
  if (part.mimeType === "text/html" && part.body?.data) {
    return decodeB64url(part.body.data).replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  }
  return "";
}

export async function listEmails(s: Session | null, query = "in:inbox newer_than:2d", max = 10) {
  const list = await gfetch(s, `${GMAIL}/messages?${new URLSearchParams({ q: query, maxResults: String(Math.min(max, 20)) })}`);
  const ids: string[] = (list.messages || []).map((m: any) => m.id);
  const msgs = await Promise.all(
    ids.map((id) =>
      gfetch(s, `${GMAIL}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`),
    ),
  );
  return msgs.map((m: any) => ({
    id: m.id,
    threadId: m.threadId,
    from: header(m, "From"),
    subject: header(m, "Subject"),
    date: header(m, "Date"),
    snippet: m.snippet,
    unread: (m.labelIds || []).includes("UNREAD"),
  }));
}

export async function readEmail(s: Session | null, id: string) {
  const m = await gfetch(s, `${GMAIL}/messages/${id}?format=full`);
  return {
    id: m.id,
    threadId: m.threadId,
    from: header(m, "From"),
    to: header(m, "To"),
    subject: header(m, "Subject"),
    date: header(m, "Date"),
    messageId: header(m, "Message-ID"),
    body: bodyText(m.payload).slice(0, 8000),
  };
}

function encodeHeader(v: string): string {
  return /^[\x00-\x7F]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, "utf8").toString("base64")}?=`;
}

export async function createDraft(
  s: Session | null,
  a: { to: string; subject: string; body: string; replyToMessageId?: string; threadId?: string },
) {
  const lines = [
    `To: ${a.to}`,
    `Subject: ${encodeHeader(a.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ];
  if (a.replyToMessageId) lines.push(`In-Reply-To: ${a.replyToMessageId}`, `References: ${a.replyToMessageId}`);
  const raw = `${lines.join("\r\n")}\r\n\r\n${Buffer.from(a.body, "utf8").toString("base64")}`;
  const message: any = { raw: Buffer.from(raw, "utf8").toString("base64url") };
  if (a.threadId) message.threadId = a.threadId;
  const d = await gfetch(s, `${GMAIL}/drafts`, { method: "POST", body: JSON.stringify({ message }) });
  return { draftId: d.id, note: "Draft saved in Gmail Drafts. Not sent." };
}
