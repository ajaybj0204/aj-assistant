// Gemini client and model choices (server only).
import { GoogleGenAI } from "@google/genai";

let client: GoogleGenAI | null = null;

export function ai(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is missing. Add it to .env.local.");
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

export const CHAT_MODELS = (process.env.GEMINI_CHAT_MODELS || "gemini-3.6-flash,gemini-3.8-flash,gemini-3.5-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);
export const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image";
export const LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || "gemini-3.8-live";
export const TTS_MODEL = process.env.GEMINI_TTS_MODEL || "gemini-3.8-flash-tts";

export { VOICES, DEFAULT_VOICE } from "./voices";

export function isBusyError(e: unknown): boolean {
  const msg = String((e as any)?.message || e);
  return /high demand|overloaded|UNAVAILABLE|503|429|RESOURCE_EXHAUSTED|not found|404/i.test(msg);
}

/** Try each chat model in order until one answers. */
export async function withModelFallback<T>(run: (model: string) => Promise<T>): Promise<T> {
  let last: unknown;
  for (const model of CHAT_MODELS) {
    try {
      return await run(model);
    } catch (e) {
      last = e;
      if (!isBusyError(e)) throw e;
    }
  }
  throw last;
}
