"use client";
import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from "@google/genai";
import { useEffect, useRef, useState } from "react";
import { PcmPlayer, startMic } from "@/lib/audio";
import type { Strings } from "@/lib/i18n";
import type { AJStore } from "@/lib/store";
import type { Mode, PendingAction } from "@/lib/types";
import { Avatar } from "./Avatar";
import { Body } from "./Body";

type Status = "idle" | "connecting" | "live" | "error";
type Line = { who: "you" | "aj"; text: string };
const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";

export function Call({ store, s, setEmotion }: { store: AJStore; s: Strings; setEmotion?: (e: string) => void }) {
  const { settings, context, apply } = store;
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [mode, setMode] = useState<Mode>("assistant");
  const [lines, setLines] = useState<Line[]>([]);
  const [level, setLevel] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [confirms, setConfirms] = useState<PendingAction[]>([]);

  const session = useRef<Session | null>(null);
  const player = useRef<PcmPlayer | null>(null);
  const mic = useRef<Awaited<ReturnType<typeof startMic>> | null>(null);
  const cam = useRef<{ stream: MediaStream; timer: number } | null>(null);
  const videoEl = useRef<HTMLVideoElement>(null);
  const raf = useRef<number>(0);

  useEffect(() => () => end(), []); // hang up when leaving the screen

  function addLine(who: Line["who"], text: string) {
    if (!text) return;
    setLines((ls) => {
      const last = ls[ls.length - 1];
      if (last && last.who === who) return [...ls.slice(0, -1), { who, text: last.text + text }];
      return [...ls.slice(-40), { who, text }];
    });
  }

  async function handleToolCalls(msg: LiveServerMessage) {
    const calls = msg.toolCall?.functionCalls || [];
    const functionResponses = await Promise.all(
      calls.map(async (fc) => {
        const r = await fetch("/api/tool", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: fc.name, args: fc.args, timeZone: tz() }),
        }).then((x) => x.json());
        if (r.actions) apply(r.actions);
        if (r.images?.length) setImages((im) => [...r.images, ...im].slice(0, 6));
        if (r.confirm) setConfirms((c) => [...c, r.confirm]);
        return { id: fc.id, name: fc.name, response: r.result };
      }),
    );
    session.current?.sendToolResponse({ functionResponses });
  }

  function onMessage(msg: LiveServerMessage) {
    const sc = msg.serverContent;
    if (sc?.interrupted) player.current?.interrupt();
    for (const p of sc?.modelTurn?.parts || []) {
      if (p.inlineData?.data && p.inlineData.mimeType?.startsWith("audio/")) player.current?.play(p.inlineData.data, p.inlineData.mimeType);
    }
    if (sc?.inputTranscription?.text) addLine("you", sc.inputTranscription.text);
    if (sc?.outputTranscription?.text) addLine("aj", sc.outputTranscription.text.replace(/\[emotion:[^\]]*\]/gi, ""));
    if (msg.toolCall) handleToolCalls(msg);
  }

  async function connect(affective: boolean): Promise<Session> {
    const r = await fetch("/api/live-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lang: settings.lang, mode, mood: settings.mood, voice: settings.voice, timeZone: tz(), context, affective }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "Could not start the call");
    const client = new GoogleGenAI({ apiKey: j.token, httpOptions: { apiVersion: "v1alpha" } });
    return new Promise<Session>((resolve, reject) => {
      let opened = false;
      client.live
        .connect({
          model: j.model,
          config: { responseModalities: [Modality.AUDIO] },
          callbacks: {
            onopen: () => { opened = true; },
            onmessage: onMessage,
            onerror: (e: any) => { if (!opened) reject(new Error(e?.message || "Connection error")); else setError("Connection problem"); },
            onclose: (e: CloseEvent) => {
              if (!opened) reject(new Error(e.reason || "Call closed"));
              else if (session.current) { setError(e.reason ? `Call ended: ${e.reason}` : ""); end(); }
            },
          },
        })
        .then(resolve, reject);
    });
  }

  async function start() {
    setError("");
    setLines([]);
    setStatus("connecting");
    try {
      player.current = new PcmPlayer();
      let sess: Session;
      try {
        sess = await connect(true);
      } catch {
        sess = await connect(false); // some voice models don't support emotional tone settings
      }
      session.current = sess;
      mic.current = await startMic((b64) => session.current?.sendRealtimeInput({ audio: { data: b64, mimeType: "audio/pcm;rate=16000" } }));
      setStatus("live");
      // Let AJ say hello first.
      sess.sendRealtimeInput({ text: settings.lang === "kn" ? "(Master Ajay ಕಾಲ್ ಮಾಡಿದ್ದಾರೆ. ಅವರನ್ನು Master ಅಂತ ಪ್ರೀತಿಯಿಂದ ಸ್ವಾಗತಿಸು.)" : "(Ajay just called you. Greet him warmly as Master.)" });
      const tick = () => {
        const l = player.current?.level() || 0;
        setLevel(l);
        setSpeaking(!!player.current?.speaking);
        raf.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e: any) {
      setError(e.message || String(e));
      setStatus("error");
      end(false);
    }
  }

  function end(reset = true) {
    cancelAnimationFrame(raf.current);
    const sess = session.current;
    session.current = null;
    try { sess?.close(); } catch {}
    mic.current?.stop();
    mic.current = null;
    stopCam();
    player.current?.close();
    player.current = null;
    setLevel(0);
    setSpeaking(false);
    if (reset) setStatus("idle");
  }

  async function toggleCam() {
    if (camOn) return stopCam();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" } });
      if (videoEl.current) {
        videoEl.current.srcObject = stream;
        await videoEl.current.play();
      }
      const canvas = document.createElement("canvas");
      const timer = window.setInterval(() => {
        const v = videoEl.current;
        if (!v || !session.current || !v.videoWidth) return;
        canvas.width = 640;
        canvas.height = Math.round((v.videoHeight / v.videoWidth) * 640);
        canvas.getContext("2d")!.drawImage(v, 0, 0, canvas.width, canvas.height);
        const data = canvas.toDataURL("image/jpeg", 0.7).split(",")[1];
        session.current.sendRealtimeInput({ video: { data, mimeType: "image/jpeg" } });
      }, 1000);
      cam.current = { stream, timer };
      setCamOn(true);
    } catch {
      alert("Camera not available.");
    }
  }

  function stopCam() {
    if (cam.current) {
      clearInterval(cam.current.timer);
      cam.current.stream.getTracks().forEach((t) => t.stop());
      cam.current = null;
    }
    setCamOn(false);
  }

  async function decide(a: PendingAction, yes: boolean) {
    setConfirms((c) => c.filter((x) => x.id !== a.id));
    if (!yes) return session.current?.sendRealtimeInput({ text: `(Ajay pressed NO on: ${a.summary})` });
    const j = await fetch("/api/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: a, timeZone: tz() }) }).then((r) => r.json());
    session.current?.sendRealtimeInput({ text: `(Result of Ajay's confirmation: ${j.text}) Tell him briefly.` });
  }

  const live = status === "live";
  const moodEmotion = !live
    ? status === "connecting" ? "thinking" : "classy"
    : speaking
      ? settings.mood === "auto" ? "happy" : settings.mood
      : "listening";

  useEffect(() => {
    setEmotion?.(moodEmotion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moodEmotion]);

  const statusText =
    status === "idle" ? (settings.lang === "kn" ? "ಕಾಲ್ ಮಾಡಲು ರೆಡಿ" : "Ready when you are")
    : status === "connecting" ? s.connecting
    : status === "error" ? "Couldn't connect"
    : speaking ? s.speaking : muted ? "Muted" : s.listening;

  return (
    <div className={`call ${live ? "is-live" : ""}`}>
      <div className="call-head">
        <span className="eyebrow mono"><i className={`dot ${live ? "live" : ""}`} /> {live ? "Live" : "Voice · Video"}</span>
        {!live && status !== "connecting" && (
          <div className="seg">
            <button className={mode === "assistant" ? "on" : ""} onClick={() => setMode("assistant")}>{s.assistant}</button>
            <button className={mode === "interview" ? "on" : ""} onClick={() => setMode("interview")}>{s.interview}</button>
          </div>
        )}
      </div>

      <div className="call-stage">
        <Body key={live ? "live" : "idle"} className="call-body" greet={live} state={speaking ? "talking" : "idle"} />
        <h2 className="display call-name">AJ</h2>
        <p className="call-status mono">{statusText}</p>
        <video ref={videoEl} className={`selfie ${camOn ? "on" : ""}`} muted playsInline />
      </div>

      {error && <p className="error">{error}</p>}

      {!!confirms.length && (
        <div className="call-confirms">
          {confirms.map((a) => (
            <div key={a.id} className="confirm pending">
              <span className="mono label">Needs your OK</span>
              <div>{a.summary}</div>
              <div className="row">
                <button className="pill solid" onClick={() => decide(a, true)}>{s.confirmYes}</button>
                <button className="pill ghost" onClick={() => decide(a, false)}>{s.confirmNo}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!!images.length && (
        <div className="call-images">
          {images.map((src, i) => (
            <a key={i} href={src} download={`aj-image-${i + 1}.jpg`}><img src={src} alt="Generated" /></a>
          ))}
        </div>
      )}

      <div className="captions">
        {lines.slice(-3).map((l, i) => (
          <p key={i} className={l.who}><span className="mono">{l.who === "you" ? "You" : "AJ"}</span>{l.text}</p>
        ))}
      </div>

      <div className="call-controls">
        {!live && status !== "connecting" ? (
          <button className="call-btn start" onClick={start}>
            <svg viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></svg>
            {s.startCall}
          </button>
        ) : (
          <div className="control-bar">
            <button className={`round ${muted ? "off" : ""}`} onClick={() => { const m = !muted; setMuted(m); mic.current?.setMuted(m); }} title={s.mic}>
              <svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />{muted && <path d="M4 4l16 16" />}</svg>
            </button>
            <button className={`round ${camOn ? "on" : ""}`} onClick={toggleCam} title={s.camera} disabled={!live}>
              <svg viewBox="0 0 24 24"><rect x="3" y="6" width="13" height="12" rx="2" /><path d="M16 10l5-3v10l-5-3z" /></svg>
            </button>
            <button className="round end" onClick={() => end()} title={s.endCall}>
              <svg viewBox="0 0 24 24"><path d="M3 15c5-5 13-5 18 0l-2.5 2.5-3-1.5v-2.5a10 10 0 0 0-5 0V16l-3 1.5z" /></svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
