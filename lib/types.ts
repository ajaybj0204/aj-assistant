// Shared types between the browser and the server.

export type Lang = "en" | "kn";
export type Mode = "assistant" | "interview";
export type Mood = "auto" | "sweet" | "romantic" | "playful" | "shy" | "classy" | "smart" | "angry";

export type Memory = { id: string; text: string; createdAt: string };
export type Contact = { id: string; name: string; email?: string; phone?: string; note?: string };
export type Todo = { id: string; text: string; due?: string; done: boolean; createdAt: string };
export type Job = {
  id: string;
  company: string;
  role: string;
  status: "saved" | "applied" | "interview" | "offer" | "rejected";
  link?: string;
  note?: string;
  updatedAt: string;
};

export type UserContext = {
  memories: Memory[];
  contacts: Contact[];
  todos: Todo[];
  jobs: Job[];
  city?: string;
};

export type Attachment = { name: string; mimeType: string; data: string }; // base64

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  emotion?: string;
  attachments?: { name: string; mimeType: string }[];
  images?: string[]; // data URLs
  sources?: { title: string; url: string }[];
  confirm?: PendingAction[];
  createdAt: string;
};

/** A change to the data kept in the browser (memory, contacts, to-dos, jobs). */
export type ClientAction =
  | { type: "memory.add"; text: string }
  | { type: "memory.remove"; id: string }
  | { type: "contact.upsert"; name: string; email?: string; phone?: string; note?: string }
  | { type: "todo.add"; text: string; due?: string }
  | { type: "todo.done"; id: string }
  | { type: "todo.remove"; id: string }
  | { type: "job.upsert"; company: string; role: string; status: Job["status"]; link?: string; note?: string };

/** Actions that affect other people or delete things: AJ asks before doing them. */
export type PendingAction = {
  id: string;
  tool: "calendar_create_event" | "calendar_update_event" | "calendar_delete_event";
  args: Record<string, any>;
  summary: string;
  status?: "pending" | "done" | "cancelled" | "failed";
  result?: string;
};

export type ChatRequest = {
  messages: { role: "user" | "assistant"; text: string }[];
  attachments?: Attachment[];
  lang: Lang;
  mode: Mode;
  mood: Mood;
  timeZone: string;
  context: UserContext;
};

export type ChatResponse = {
  reply: string;
  emotion: string; // the feeling AJ shows in this reply, drives her avatar glow
  images: string[];
  sources: { title: string; url: string }[];
  actions: ClientAction[];
  confirm: PendingAction[];
  toolsUsed: string[];
};
