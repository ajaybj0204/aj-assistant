"use client";
import { speak } from "@/lib/audio";
import type { Strings } from "@/lib/i18n";
import type { AJStore } from "@/lib/store";
import type { Mood } from "@/lib/types";
import { VOICES } from "@/lib/voices";

export type Me = { googleConfigured: boolean; signedIn: boolean; email?: string; name?: string; picture?: string };

const MOODS: { id: Mood; label: string }[] = [
  { id: "auto", label: "✨ Auto (she decides)" },
  { id: "sweet", label: "🥰 Sweet" },
  { id: "romantic", label: "💗 Romantic" },
  { id: "playful", label: "😜 Playful" },
  { id: "shy", label: "🙈 Shy" },
  { id: "classy", label: "✨ Classy" },
  { id: "smart", label: "🧠 Smart & focused" },
  { id: "angry", label: "😤 Angry / sassy" },
];

export function Settings({ store, s, me }: { store: AJStore; s: Strings; me: Me | null }) {
  const { settings, setSettings } = store;
  const set = <K extends keyof typeof settings>(k: K, v: (typeof settings)[K]) => setSettings((x) => ({ ...x, [k]: v }));

  return (
    <div className="panel">
      <section className="card">
        <h2>🌐 {s.language}</h2>
        <div className="seg">
          <button className={settings.lang === "en" ? "on" : ""} onClick={() => set("lang", "en")}>English</button>
          <button className={settings.lang === "kn" ? "on" : ""} onClick={() => set("lang", "kn")}>ಕನ್ನಡ</button>
        </div>
      </section>

      <section className="card">
        <h2>💫 {s.mood}</h2>
        <div className="mood-grid">
          {MOODS.map((m) => (
            <button key={m.id} className={settings.mood === m.id ? "on" : ""} onClick={() => set("mood", m.id)}>{m.label}</button>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>🎙️ {s.voice}</h2>
        <div className="row">
          <select value={settings.voice} onChange={(e) => set("voice", e.target.value)}>
            {VOICES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
          <button
            onClick={() =>
              speak(
                settings.lang === "kn" ? "ಹಾಯ್ Ajay! ನಾನು AJ. ಇವತ್ತು ನಿಮಗೆ ಏನು ಸಹಾಯ ಮಾಡಲಿ?" : "Hey Ajay! It's me, AJ. So... what are we doing today?",
                settings.voice,
                "sweet",
              ).catch((e) => alert(e.message))
            }
          >
            ▶ {s.testVoice}
          </button>
        </div>
        <label className="check">
          <input type="checkbox" checked={settings.autoSpeak} onChange={(e) => set("autoSpeak", e.target.checked)} /> {s.readAloud}
        </label>
      </section>

      <section className="card">
        <h2>☀️ {s.brief}</h2>
        <div className="grid-form">
          <label>{s.city}<input value={settings.city} onChange={(e) => set("city", e.target.value)} /></label>
          <label>Time<input type="time" value={settings.briefTime} onChange={(e) => set("briefTime", e.target.value)} /></label>
        </div>
        <small className="muted">AJ makes your brief automatically the first time you open her after this time each day.</small>
      </section>

      <section className="card">
        <h2>🔗 {s.google}</h2>
        {!me?.googleConfigured ? (
          <p className="muted">Google sign-in isn't set up yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local (see README).</p>
        ) : me.signedIn ? (
          <div className="row">
            {me.picture && <img src={me.picture} alt="" className="pfp" />}
            <span>{me.email}</span>
            <button onClick={() => fetch("/api/auth/logout", { method: "POST" }).then(() => location.reload())}>{s.disconnect}</button>
          </div>
        ) : (
          <a className="button primary" href="/api/auth/login">{s.connect}</a>
        )}
      </section>

      <section className="card">
        <h2>🗑️ Data</h2>
        <small className="muted">Chats, memory, contacts, to-dos and jobs are saved in this browser only.</small>
        <div className="row">
          <button onClick={() => confirm("Delete all chats?") && store.setChats([])}>{s.clearAll}: {s.chat}</button>
        </div>
      </section>
    </div>
  );
}
