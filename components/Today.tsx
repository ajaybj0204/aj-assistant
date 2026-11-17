"use client";
import { useEffect, useState } from "react";
import { speak } from "@/lib/audio";
import type { Strings } from "@/lib/i18n";
import { uid, type AJStore } from "@/lib/store";
import { Avatar } from "./Avatar";

const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
const todayKey = () => new Date().toLocaleDateString("en-CA");

export function Today({ store, s, autoBrief }: { store: AJStore; s: Strings; autoBrief: boolean }) {
  const { settings, setSettings, context, todos, setTodos } = store;
  const [brief, setBrief] = useState<{ text: string; emotion: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [newTodo, setNewTodo] = useState("");

  async function getBrief() {
    setLoading(true);
    try {
      const r = await fetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang: settings.lang, mood: settings.mood, timeZone: tz(), context }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setBrief(j);
      setSettings((x) => ({ ...x, lastBriefDate: todayKey() }));
    } catch (e: any) {
      setBrief({ text: `⚠️ ${e.message}`, emotion: "sad" });
    } finally {
      setLoading(false);
    }
  }

  // Opened after brief time and no brief yet today: make one automatically.
  useEffect(() => {
    if (autoBrief) getBrief();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoBrief]);

  const open = todos.filter((t) => !t.done);
  const done = todos.filter((t) => t.done).slice(-5);

  return (
    <div className="panel">
      <section className="card brief">
        <div className="card-head">
          <Avatar size={56} emotion={brief?.emotion || "happy"} active={loading} />
          <div>
            <h2>☀️ {s.brief}</h2>
            <small>{new Date().toLocaleDateString(settings.lang === "kn" ? "kn-IN" : "en-IN", { weekday: "long", day: "numeric", month: "long" })}</small>
          </div>
        </div>
        {brief ? <p className="brief-text">{brief.text}</p> : <p className="muted">{loading ? s.thinking : ""}</p>}
        <div className="row">
          <button className="primary" onClick={getBrief} disabled={loading}>{loading ? s.thinking : s.getBrief}</button>
          {brief && !brief.text.startsWith("⚠️") && <button onClick={() => speak(brief.text, settings.voice, brief.emotion).catch((e) => alert(e.message))}>🔊</button>}
        </div>
      </section>

      <section className="card">
        <h2>✅ {s.todos}</h2>
        <form className="row" onSubmit={(e) => { e.preventDefault(); if (!newTodo.trim()) return; setTodos((t) => [...t, { id: uid(), text: newTodo.trim(), done: false, createdAt: new Date().toISOString() }]); setNewTodo(""); }}>
          <input value={newTodo} onChange={(e) => setNewTodo(e.target.value)} placeholder={s.addTodo} />
          <button className="primary">＋</button>
        </form>
        <ul className="list">
          {open.map((t) => (
            <li key={t.id}>
              <input type="checkbox" onChange={() => setTodos((all) => all.map((x) => (x.id === t.id ? { ...x, done: true } : x)))} />
              <span>{t.text}{t.due && <small> · {new Date(t.due).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</small>}</span>
              <button className="x" onClick={() => setTodos((all) => all.filter((x) => x.id !== t.id))}>×</button>
            </li>
          ))}
          {done.map((t) => (
            <li key={t.id} className="done">
              <input type="checkbox" checked readOnly />
              <span>{t.text}</span>
              <button className="x" onClick={() => setTodos((all) => all.filter((x) => x.id !== t.id))}>×</button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
