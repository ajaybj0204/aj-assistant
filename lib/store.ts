"use client";
// Everything AJ remembers is kept in this browser (localStorage) for now.
import { useCallback, useEffect, useState } from "react";
import type { ChatMessage, ClientAction, Contact, Job, Lang, Memory, Mode, Mood, Todo, UserContext } from "./types";

export type Settings = {
  lang: Lang;
  mood: Mood;
  voice: string;
  city: string;
  autoSpeak: boolean; // AJ speaks every reply out loud
  briefTime: string; // "09:00"
  lastBriefDate?: string;
};

export const DEFAULT_SETTINGS: Settings = { lang: "en", mood: "auto", voice: "Sulafat", city: "Bengaluru", autoSpeak: true, briefTime: "09:00" };

const KEYS = {
  settings: "aj.settings",
  chats: "aj.chats",
  memories: "aj.memories",
  contacts: "aj.contacts",
  todos: "aj.todos",
  jobs: "aj.jobs",
} as const;

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full (usually big images): drop images from old chats and retry once.
    if (key === KEYS.chats && Array.isArray(value)) {
      const slim = (value as ChatMessage[]).map((m, i, a) => (i < a.length - 6 ? { ...m, images: undefined } : m));
      try {
        localStorage.setItem(key, JSON.stringify(slim));
      } catch {}
    }
  }
}

function usePersisted<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(fallback);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const v = read<T>(key, fallback);
    setValue(Array.isArray(fallback) ? v : ({ ...fallback, ...v } as T));
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    if (ready) write(key, value);
  }, [key, value, ready]);
  return [value, setValue, ready] as const;
}

export const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10));
const nowIso = () => new Date().toISOString();

export function useAJStore() {
  const [settings, setSettings, ready] = usePersisted<Settings>(KEYS.settings, DEFAULT_SETTINGS);
  const [chats, setChats] = usePersisted<ChatMessage[]>(KEYS.chats, []);
  const [memories, setMemories] = usePersisted<Memory[]>(KEYS.memories, []);
  const [contacts, setContacts] = usePersisted<Contact[]>(KEYS.contacts, []);
  const [todos, setTodos] = usePersisted<Todo[]>(KEYS.todos, []);
  const [jobs, setJobs] = usePersisted<Job[]>(KEYS.jobs, []);

  const context: UserContext = { memories, contacts, todos, jobs, city: settings.city };

  const apply = useCallback((actions: ClientAction[]) => {
    for (const a of actions) {
      switch (a.type) {
        case "memory.add":
          setMemories((m) => (m.some((x) => x.text === a.text) ? m : [...m, { id: uid(), text: a.text, createdAt: nowIso() }]));
          break;
        case "memory.remove":
          setMemories((m) => m.filter((x) => x.id !== a.id));
          break;
        case "contact.upsert":
          setContacts((list) => {
            const i = list.findIndex((c) => c.name.toLowerCase() === a.name.toLowerCase());
            const next = { id: i >= 0 ? list[i].id : uid(), name: a.name, email: a.email, phone: a.phone, note: a.note };
            if (i < 0) return [...list, next];
            const merged = { ...list[i], ...Object.fromEntries(Object.entries(next).filter(([, v]) => v)) };
            return list.map((c, j) => (j === i ? merged : c));
          });
          break;
        case "todo.add":
          setTodos((t) => [...t, { id: uid(), text: a.text, due: a.due, done: false, createdAt: nowIso() }]);
          break;
        case "todo.done":
          setTodos((t) => t.map((x) => (x.id === a.id ? { ...x, done: true } : x)));
          break;
        case "todo.remove":
          setTodos((t) => t.filter((x) => x.id !== a.id));
          break;
        case "job.upsert":
          setJobs((list) => {
            const i = list.findIndex((j) => j.company.toLowerCase() === a.company.toLowerCase() && j.role.toLowerCase() === a.role.toLowerCase());
            const next: Job = { id: i >= 0 ? list[i].id : uid(), company: a.company, role: a.role, status: a.status, link: a.link ?? list[i]?.link, note: a.note ?? list[i]?.note, updatedAt: nowIso() };
            return i < 0 ? [next, ...list] : list.map((j, k) => (k === i ? next : j));
          });
          break;
      }
    }
  }, [setMemories, setContacts, setTodos, setJobs]);

  return { ready, settings, setSettings, chats, setChats, memories, setMemories, contacts, setContacts, todos, setTodos, jobs, setJobs, context, apply };
}

export type AJStore = ReturnType<typeof useAJStore>;
export type { Mode };
