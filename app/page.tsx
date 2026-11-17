"use client";
import { useEffect, useState } from "react";
import { Avatar, EMOTION_EMOJI, moodColor } from "@/components/Avatar";
import { Call } from "@/components/Call";
import { Chat } from "@/components/Chat";
import { Me as MePanel } from "@/components/Me";
import { Settings, type Me } from "@/components/Settings";
import { Today } from "@/components/Today";
import { t } from "@/lib/i18n";
import { useAJStore } from "@/lib/store";

type Tab = "chat" | "call" | "today" | "me" | "settings";

const ICONS: Record<Tab, React.ReactNode> = {
  chat: (
    <svg viewBox="0 0 24 24"><path d="M4 5h16v11H8l-4 4z" /></svg>
  ),
  call: (
    <svg viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></svg>
  ),
  today: (
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
  ),
  me: (
    <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
  ),
};

export default function Home() {
  const store = useAJStore();
  const s = t(store.settings.lang);
  const [tab, setTab] = useState<Tab>("chat");
  const [emotion, setEmotion] = useState("happy");
  const [me, setMe] = useState<Me | null>(null);
  const [autoBrief, setAutoBrief] = useState(false);

  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then(setMe).catch(() => {});
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  // Morning brief: first open after the brief time each day.
  useEffect(() => {
    if (!store.ready) return;
    const [h, m] = store.settings.briefTime.split(":").map(Number);
    const now = new Date();
    const due = now.getHours() * 60 + now.getMinutes() >= h * 60 + m;
    if (due && store.settings.lastBriefDate !== now.toLocaleDateString("en-CA")) {
      setTab("today");
      setAutoBrief(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.ready]);

  useEffect(() => {
    document.documentElement.lang = store.settings.lang === "kn" ? "kn" : "en";
  }, [store.settings.lang]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "chat", label: s.chat },
    { id: "call", label: s.call },
    { id: "today", label: s.today },
    { id: "me", label: s.me },
    { id: "settings", label: s.settings },
  ];

  const mood = moodColor(emotion);

  return (
    <div className="app" style={{ ["--mood" as any]: mood }}>
      <div className="backdrop" aria-hidden>
        <div className="glow warm" />
        <div className="glow tide" />
        <div className="glow moodglow" />
        <div className="stars" />
        <div className="grain" />
      </div>

      {!store.ready ? (
        <div className="loading"><Avatar size={96} emotion="happy" active halo /></div>
      ) : (
        <>
          <aside className="rail">
            <button className="rail-brand" onClick={() => setTab("chat")} aria-label="AJ">
              <Avatar size={42} emotion={emotion} />
              <span className="rail-name">
                <b>AJ</b>
                <small className="mono">{EMOTION_EMOJI[emotion]} {emotion}</small>
              </span>
            </button>
            <nav className="rail-nav">
              {tabs.map((x) => (
                <button key={x.id} className={`rail-item ${tab === x.id ? "on" : ""} ${x.id === "call" ? "is-call" : ""}`} onClick={() => setTab(x.id)}>
                  <span className="ico">{ICONS[x.id]}</span>
                  <span className="lbl">{x.label}</span>
                </button>
              ))}
            </nav>
            <div className="lang">
              <button className={store.settings.lang === "en" ? "on" : ""} onClick={() => store.setSettings((x) => ({ ...x, lang: "en" }))}>EN</button>
              <button className={store.settings.lang === "kn" ? "on" : ""} onClick={() => store.setSettings((x) => ({ ...x, lang: "kn" }))}>ಕ</button>
            </div>
          </aside>

          <main className="stage-main" key={tab}>
            {tab === "chat" && <Chat store={store} s={s} emotion={emotion} setEmotion={setEmotion} />}
            {tab === "call" && <Call store={store} s={s} setEmotion={setEmotion} />}
            {tab === "today" && <Today store={store} s={s} autoBrief={autoBrief} />}
            {tab === "me" && <MePanel store={store} s={s} />}
            {tab === "settings" && <Settings store={store} s={s} me={me} />}
          </main>
        </>
      )}
    </div>
  );
}
