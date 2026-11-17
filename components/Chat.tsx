"use client";
import { useEffect, useRef, useState } from "react";
import { fetchSpeech, playSpeech, prepareSpeech, speak, stopSpeaking } from "@/lib/audio";
import type { Strings } from "@/lib/i18n";
import { uid, type AJStore } from "@/lib/store";
import type { Attachment, ChatMessage, ChatResponse, Mode, PendingAction } from "@/lib/types";
import { Avatar, EMOTION_EMOJI, moodColor } from "./Avatar";
import { Body } from "./Body";

const MAX_FILE_MB = 8;
const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";

function fileToAttachment(f: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve({ name: f.name, mimeType: f.type || "application/octet-stream", data: String(r.result).split(",")[1] });
    r.onerror = reject;
    r.readAsDataURL(f);
  });
}

function renderText(text: string) {
  // Light formatting: links and **bold**.
  const parts = text.split(/(https?:\/\/[^\s)]+|\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    /^https?:\/\//.test(p) ? (
      <a key={i} href={p} target="_blank" rel="noreferrer">
        {p}
      </a>
    ) : /^\*\*/.test(p) ? (
      <strong key={i}>{p.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

export function Chat({ store, s, emotion, setEmotion }: { store: AJStore; s: Strings; emotion: string; setEmotion: (e: string) => void }) {
  const { chats, setChats, settings, context, apply } = store;
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>("assistant");
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (chats.length || busy) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chats.length, busy]);

  // ---- AJ says hi: she waves and says hello. Tap her any time to do it again. ----
  const [greetKey, setGreetKey] = useState(0);
  const [tapHint, setTapHint] = useState(false);
  const [voiceNote, setVoiceNote] = useState("");

  async function sayHi(fromTap: boolean) {
    setTapHint(false);
    setGreetKey((k) => k + 1);
    if (!settings.autoSpeak && !fromTap) return;
    const line = settings.lang === "kn" ? "ಹಾಯ್ Master! ನಾನು ಇಲ್ಲೇ ಇದ್ದೀನಿ." : "Hey Master! I'm right here.";
    // Her hello is saved on this device, so it doesn't use voice quota every time.
    const key = `aj.hello.${settings.voice}.${settings.lang}`;
    let audio: HTMLAudioElement | null = null;
    const cached = localStorage.getItem(key);
    if (cached) audio = new Audio(cached);
    else {
      const got = await fetchSpeech(line, settings.voice);
      if (got.error) return setVoiceNote(got.error);
      audio = new Audio(got.url!);
      try { localStorage.setItem(key, got.dataUrl!); } catch {}
    }
    setVoiceNote("");
    try {
      await audio.play();
      audio.pause();
      audio.currentTime = 0;
    } catch {
      // Phones block sound until the first tap: show the hint and wait for it.
      if (!fromTap) return setTapHint(true);
    }
    setSpeaking(true);
    playSpeech(audio).finally(() => setSpeaking(false));
  }

  // When the app opens she waves and says hello once.
  useEffect(() => {
    sayHi(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send(text = input) {
    if ((!text.trim() && !files.length) || busy) return;
    const tooBig = files.find((f) => f.size > MAX_FILE_MB * 1024 * 1024);
    if (tooBig) return alert(`${tooBig.name} is bigger than ${MAX_FILE_MB} MB.`);
    const attachments = await Promise.all(files.map(fileToAttachment));
    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      text: text.trim() || "(see attached file)",
      attachments: files.map((f) => ({ name: f.name, mimeType: f.type })),
      createdAt: new Date().toISOString(),
    };
    stopSpeaking(); // a new question interrupts her, like in a real conversation
    setSpeaking(false);
    const next = [...chats, userMsg];
    setChats(next);
    setInput("");
    setFiles([]);
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, text: m.text })),
          attachments,
          lang: settings.lang,
          mode,
          mood: settings.mood,
          timeZone: tz(),
          context,
        }),
      });
      const j = (await res.json()) as ChatResponse & { error?: string };
      if (!res.ok) throw new Error(j.error || "Error");
      apply(j.actions);
      // Get her voice first, so the answer appears and she speaks it at the same moment.
      const voice = settings.autoSpeak && j.reply ? await prepareSpeech(j.reply, settings.voice, j.emotion) : null;
      setEmotion(j.emotion);
      setChats((c) => [
        ...c,
        { id: uid(), role: "assistant", text: j.reply, images: j.images, sources: j.sources, confirm: j.confirm, createdAt: new Date().toISOString(), emotion: j.emotion },
      ]);
      if (settings.autoSpeak && j.reply && !voice) setVoiceNote("AJ's voice is resting right now (daily free limit). Replies still show as text.");
      if (voice) {
        setVoiceNote("");
        setSpeaking(true);
        playSpeech(voice).finally(() => setSpeaking(false));
      }
    } catch (e: any) {
      setChats((c) => [...c, { id: uid(), role: "assistant", text: `⚠️ ${e.message}`, createdAt: new Date().toISOString() }]);
    } finally {
      setBusy(false);
    }
  }

  async function decide(msgId: string, action: PendingAction, yes: boolean) {
    const mark = (patch: Partial<PendingAction>) =>
      setChats((c) => c.map((m) => (m.id === msgId ? { ...m, confirm: m.confirm?.map((a) => (a.id === action.id ? { ...a, ...patch } : a)) } : m)));
    if (!yes) return mark({ status: "cancelled" });
    mark({ status: "done", result: "…" });
    const res = await fetch("/api/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, timeZone: tz() }) });
    const j = await res.json();
    mark({ status: j.ok ? "done" : "failed", result: j.text });
    setChats((c) => [...c, { id: uid(), role: "assistant", text: (j.ok ? "✅ " : "⚠️ ") + j.text, createdAt: new Date().toISOString() }]);
  }

  function dictate() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return alert("Voice typing works in Chrome or Edge.");
    const r = new SR();
    r.lang = settings.lang === "kn" ? "kn-IN" : "en-IN";
    r.interimResults = true;
    // Talk to her: what you say shows live, then sends by itself when you stop speaking.
    r.onresult = (e: any) => {
      const said = Array.from(e.results as ArrayLike<any>).map((x: any) => x[0].transcript).join(" ");
      setInput(said);
      if (e.results[e.results.length - 1].isFinal) {
        r.stop();
        send(said);
      }
    };
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    stopSpeaking();
    setListening(true);
    r.start();
  }

  const hour = new Date().getHours();
  const greet =
    settings.lang === "kn"
      ? hour < 12 ? "ಶುಭೋದಯ," : hour < 17 ? "ನಮಸ್ಕಾರ," : "ಶುಭ ಸಂಜೆ,"
      : hour < 12 ? "Good morning," : hour < 17 ? "Good afternoon," : "Good evening,";
  const face = busy ? "thinking" : emotion;
  const suggestions =
    settings.lang === "kn"
      ? [
          { k: "ಪ್ಲಾನ್", t: "ಇಂದು ನನ್ನ ಪ್ಲಾನ್ ಏನು?" },
          { k: "ಮೀಟ್", t: "ನಾಳೆ 3:30ಕ್ಕೆ Google Meet ಮೀಟಿಂಗ್ ಇಡು" },
          { k: "ಚಿತ್ರ", t: "ಮೈಸೂರು ಅರಮನೆಯ ಚಿತ್ರ ಮಾಡು" },
          { k: "ಮೇಲ್", t: "ಇವತ್ತು ಬಂದ ಮುಖ್ಯ ಮೇಲ್‌ಗಳು ಯಾವುವು?" },
        ]
      : [
          { k: "Plan", t: "What's my plan today?" },
          { k: "Meet", t: "Schedule a Google Meet tomorrow at 3:30 PM" },
          { k: "Image", t: "Make me an image of a cozy Bengaluru café" },
          { k: "Inbox", t: "Any important emails today?" },
        ];

  return (
    <div className="chat">
      <header className="topbar">
        <div className="who">
          <Avatar size={38} emotion={face} active={busy || speaking} />
          <div>
            <b className="display">AJ</b>
            <span className="status mono"><i className="dot" /> {busy ? s.thinking : speaking ? `🔊 ${s.speaking}` : listening ? `🎙️ ${s.listening}` : `${EMOTION_EMOJI[emotion] || ""} ${emotion}`}</span>
          </div>
        </div>
        <div className="seg">
          <button className={mode === "assistant" ? "on" : ""} onClick={() => setMode("assistant")}>{s.assistant}</button>
          <button
            className={mode === "interview" ? "on" : ""}
            onClick={() => {
              setMode("interview");
              if (mode !== "interview") send(settings.lang === "kn" ? "ಇಂಟರ್ವ್ಯೂ ಅಭ್ಯಾಸ ಶುರು ಮಾಡೋಣ" : "Let's start interview practice");
            }}
          >
            {s.interview}
          </button>
        </div>
        <button className="pill ghost" onClick={() => confirm(s.newChat + "?") && setChats([])}>＋ <span className="hide-sm">{s.newChat}</span></button>
      </header>

      <div className="chat-wrap">
      <div className="messages">
        {!chats.length && (
          <section className="hero">
            <Body className="hero-body" greetKey={greetKey} onTap={() => sayHi(true)} state={speaking ? "talking" : "idle"} />
            {tapHint && <button className="tap-hint mono" onClick={() => sayHi(true)}>👋 {settings.lang === "kn" ? "ಹಾಯ್ ಹೇಳಲು ಟ್ಯಾಪ್ ಮಾಡಿ" : "Tap to say hi"}</button>}
            <span className="eyebrow mono"><i className="dot" /> {settings.lang === "kn" ? "ಆನ್‌ಲೈನ್ · ನಿಮಗಾಗಿ" : "Online · here for you"}</span>
            <h1 className="display">
              {greet} <span className="tide">Master.</span>
            </h1>
            <p className="lede">{s.empty}</p>
            <div className="suggest">
              {suggestions.map((c, i) => (
                <button key={c.t} onClick={() => send(c.t)} style={{ animationDelay: `${0.15 + i * 0.07}s` }}>
                  <span className="mono">{c.k}</span>
                  {c.t}
                </button>
              ))}
            </div>
          </section>
        )}
        {chats.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            {m.role === "assistant" && <Avatar size={32} emotion={m.emotion || "calm"} />}
            <div className="bubble" style={m.role === "assistant" ? ({ ["--mood" as any]: moodColor(m.emotion) } as any) : undefined}>
              {m.role === "assistant" && m.emotion && <span className="emo">{EMOTION_EMOJI[m.emotion] || ""}</span>}
              <div className="text">{renderText(m.text)}</div>
              {m.attachments?.map((a) => <div key={a.name} className="file mono">📎 {a.name}</div>)}
              {m.images?.map((src, i) => (
                <a key={i} href={src} download={`aj-image-${i + 1}.jpg`} className="gen">
                  <img src={src} alt="Generated" />
                  <span className="mono">↓ Save</span>
                </a>
              ))}
              {!!m.sources?.length && (
                <div className="sources">
                  {m.sources.map((src, i) => (
                    <a key={i} href={src.url} target="_blank" rel="noreferrer"><span className="mono">{i + 1}</span>{src.title}</a>
                  ))}
                </div>
              )}
              {m.confirm?.map((a) => (
                <div key={a.id} className={`confirm ${a.status}`}>
                  <span className="mono label">Needs your OK</span>
                  <div>{a.summary}</div>
                  {a.status === "pending" ? (
                    <div className="row">
                      <button className="pill solid" onClick={() => decide(m.id, a, true)}>{s.confirmYes}</button>
                      <button className="pill ghost" onClick={() => decide(m.id, a, false)}>{s.confirmNo}</button>
                    </div>
                  ) : (
                    <small>{a.status === "cancelled" ? "Cancelled" : a.result}</small>
                  )}
                </div>
              ))}
              {m.role === "assistant" && m.text && !m.text.startsWith("⚠️") && (
                <button className="speak" title="Read aloud" onClick={() => speak(m.text, settings.voice, m.emotion).catch((e) => alert(e.message))}>
                  <svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /></svg>
                </button>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="msg assistant">
            <Avatar size={32} emotion="thinking" active />
            <div className="bubble typing"><span /><span /><span /></div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      {!!chats.length && (
        <aside className="side-body">
          <Body greetKey={greetKey} onTap={() => sayHi(true)} state={speaking ? "talking" : "idle"} />
          <span className="mono">{busy ? s.thinking : speaking ? s.speaking : "AJ"}</span>
        </aside>
      )}
      </div>

      <div className="dock">
        {voiceNote && <div className="voice-note mono" onClick={() => setVoiceNote("")}>🔇 {voiceNote}</div>}
        {!!files.length && (
          <div className="pending-files">
            {files.map((f, i) => (
              <span key={i} className="mono">📎 {f.name} <button onClick={() => setFiles(files.filter((_, j) => j !== i))}>×</button></span>
            ))}
          </div>
        )}
        <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <button type="button" className="icon-btn" title={s.attach} onClick={() => fileRef.current?.click()}>
            <svg viewBox="0 0 24 24"><path d="M20 11.5l-8.2 8.2a5 5 0 0 1-7-7L13 4.5a3.5 3.5 0 0 1 5 5L9.8 17.7a2 2 0 0 1-2.8-2.8L14.5 7.4" /></svg>
          </button>
          <input ref={fileRef} type="file" hidden multiple accept="image/*,application/pdf,text/*,.doc,.docx,.csv" onChange={(e) => setFiles([...files, ...Array.from(e.target.files || [])])} />
          <textarea
            value={input}
            placeholder={s.typeHere}
            rows={1}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          />
          <button type="button" className={`icon-btn ${listening ? "rec" : ""}`} title="Voice typing" onClick={dictate}>
            <svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
          </button>
          <button type="submit" className="send-btn" disabled={busy || (!input.trim() && !files.length)} aria-label={s.send}>
            <svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </button>
        </form>
      </div>
    </div>
  );
}
