"use client";
// Small audio helpers for the live call and read-aloud.

export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function pcm16ToFloat(bytes: Uint8Array): Float32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Float32Array(bytes.byteLength / 2);
  for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true) / 32768;
  return out;
}

function rateFromMime(mime: string | undefined, fallback: number): number {
  const m = mime?.match(/rate=(\d+)/);
  return m ? Number(m[1]) : fallback;
}

/** Plays streamed 16-bit PCM chunks back-to-back (AJ's voice on the call). */
export class PcmPlayer {
  ctx: AudioContext;
  analyser: AnalyserNode;
  private next = 0;
  private sources = new Set<AudioBufferSourceNode>();

  constructor() {
    this.ctx = new AudioContext({ sampleRate: 24000 });
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.connect(this.ctx.destination);
  }

  play(b64: string, mime?: string) {
    const samples = pcm16ToFloat(b64ToBytes(b64));
    const rate = rateFromMime(mime, 24000);
    const buf = this.ctx.createBuffer(1, samples.length, rate);
    buf.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.analyser);
    const start = Math.max(this.ctx.currentTime + 0.02, this.next);
    src.start(start);
    this.next = start + buf.duration;
    this.sources.add(src);
    src.onended = () => this.sources.delete(src);
  }

  /** Stop talking right away (when Ajay interrupts). */
  interrupt() {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {}
    }
    this.sources.clear();
    this.next = 0;
  }

  get speaking(): boolean {
    return this.sources.size > 0;
  }

  level(): number {
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const v of data) sum += ((v - 128) / 128) ** 2;
    return Math.min(1, Math.sqrt(sum / data.length) * 4);
  }

  close() {
    this.interrupt();
    this.ctx.close().catch(() => {});
  }
}

const WORKLET = `
class MicTap extends AudioWorkletProcessor {
  constructor() { super(); this.buf = []; this.len = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      this.buf.push(new Float32Array(ch)); this.len += ch.length;
      if (this.len >= 1600) {
        const out = new Float32Array(this.len); let o = 0;
        for (const b of this.buf) { out.set(b, o); o += b.length; }
        this.port.postMessage(out, [out.buffer]); this.buf = []; this.len = 0;
      }
    }
    return true;
  }
}
registerProcessor('mic-tap', MicTap);
`;

/** Captures the microphone as 16 kHz 16-bit PCM chunks (~100 ms each). */
export async function startMic(onChunk: (b64: string) => void, onLevel?: (l: number) => void) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const ctx = new AudioContext({ sampleRate: 16000 });
  const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
  await ctx.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);
  const src = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, "mic-tap");
  let muted = false;
  node.port.onmessage = (e: MessageEvent<Float32Array>) => {
    const f = e.data;
    let sum = 0;
    const pcm = new Int16Array(f.length);
    for (let i = 0; i < f.length; i++) {
      const s = Math.max(-1, Math.min(1, f[i]));
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      sum += s * s;
    }
    onLevel?.(Math.min(1, Math.sqrt(sum / f.length) * 5));
    if (!muted) onChunk(bytesToB64(new Uint8Array(pcm.buffer)));
  };
  src.connect(node);
  return {
    setMuted(m: boolean) {
      muted = m;
      stream.getAudioTracks().forEach((t) => (t.enabled = !m));
    },
    stop() {
      node.disconnect();
      src.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      ctx.close().catch(() => {});
    },
  };
}

/** Wraps raw 16-bit PCM (from text-to-speech) in a WAV file so the browser can play it. */
export function pcmToWavUrl(b64: string, mime?: string): string {
  const pcm = b64ToBytes(b64);
  const rate = rateFromMime(mime, 24000);
  const header = new ArrayBuffer(44);
  const v = new DataView(header);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF");
  v.setUint32(4, 36 + pcm.length, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, pcm.length, true);
  return URL.createObjectURL(new Blob([header, pcm as Uint8Array<ArrayBuffer>], { type: "audio/wav" }));
}

let current: HTMLAudioElement | null = null;

/**
 * Gets AJ's voice for a reply, ready to play (so text and voice can appear together).
 * Gives up after `timeoutMs` so a slow voice never blocks the answer.
 */
export async function prepareSpeech(text: string, voice: string, emotion?: string, timeoutMs = 15000): Promise<HTMLAudioElement | null> {
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice, emotion }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const j = await res.json();
    if (!res.ok || !j.audio) return null;
    const raw = /L16|pcm/i.test(j.mimeType || "");
    const url = raw
      ? pcmToWavUrl(j.audio, j.mimeType)
      : URL.createObjectURL(new Blob([b64ToBytes(j.audio) as Uint8Array<ArrayBuffer>], { type: j.mimeType || "audio/wav" }));
    const audio = new Audio(url);
    audio.preload = "auto";
    return audio;
  } catch {
    return null;
  }
}

/** Gets AJ's voice as a playable URL plus a data URL that can be saved on the device. */
export async function fetchSpeech(text: string, voice: string): Promise<{ url?: string; dataUrl?: string; error?: string }> {
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice }),
      signal: AbortSignal.timeout(20000),
    });
    const j = await res.json();
    if (!res.ok || !j.audio) return { error: j.error || "Voice is unavailable right now." };
    const raw = /L16|pcm/i.test(j.mimeType || "");
    const url = raw ? pcmToWavUrl(j.audio, j.mimeType) : URL.createObjectURL(new Blob([b64ToBytes(j.audio) as Uint8Array<ArrayBuffer>], { type: j.mimeType }));
    // For saving: turn the playable audio into a data URL.
    const blob = await fetch(url).then((r) => r.blob());
    const dataUrl = await new Promise<string>((ok) => {
      const fr = new FileReader();
      fr.onload = () => ok(String(fr.result));
      fr.readAsDataURL(blob);
    });
    return { url, dataUrl };
  } catch {
    return { error: "Voice is unavailable right now." };
  }
}

/** Plays a prepared voice clip; resolves when she finishes talking. */
export function playSpeech(audio: HTMLAudioElement): Promise<void> {
  current?.pause();
  current = audio;
  return new Promise((resolve) => {
    audio.onended = () => resolve();
    audio.onerror = () => resolve();
    audio.play().catch(() => resolve());
  });
}

/** Speaks text in AJ's natural voice via the server's text-to-speech. */
export async function speak(text: string, voice: string, emotion?: string): Promise<void> {
  current?.pause();
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice, emotion }),
  });
  const j = await res.json();
  if (!res.ok || !j.audio) throw new Error(j.error || "Voice failed");
  // The voice may arrive as raw PCM (needs a WAV header) or as a ready-made audio file.
  const raw = /L16|pcm/i.test(j.mimeType || "");
  const url = raw
    ? pcmToWavUrl(j.audio, j.mimeType)
    : URL.createObjectURL(new Blob([b64ToBytes(j.audio) as Uint8Array<ArrayBuffer>], { type: j.mimeType || "audio/wav" }));
  const audio = new Audio(url);
  current = audio;
  await audio.play();
}

export function stopSpeaking() {
  current?.pause();
  current = null;
}
