import { ai, DEFAULT_VOICE, isBusyError, TTS_MODEL, VOICES } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

// Voice models to try in order. Each has its own free daily limit, so when one runs out
// AJ moves to the next instead of going silent.
const TTS_MODELS = [
  TTS_MODEL,
  ...(process.env.GEMINI_TTS_FALLBACKS || "gemini-3.8-flash-lite-tts,gemini-3.1-flash-tts-preview,gemini-2.5-flash-preview-tts")
    .split(",")
    .map((m) => m.trim()),
].filter((m, i, a) => m && a.indexOf(m) === i);

// Reads AJ's text aloud in a natural human voice (chat replies, greeting, morning brief).
export async function POST(req: Request) {
  const { text, voice } = (await req.json()) as { text: string; voice?: string; emotion?: string };
  const voiceName = VOICES.some((v) => v.id === voice) ? voice! : DEFAULT_VOICE;
  // Only the answer itself: no instructions (they used to get read out loud before the answer).
  const spoken = text
    .replace(/https?:\/\/\S+/g, "") // never read links aloud
    .replace(/[*#_`>]/g, "")
    .trim()
    .slice(0, 3000);
  if (!spoken) return Response.json({ error: "Nothing to say" }, { status: 400 });

  let last = "";
  for (const model of TTS_MODELS) {
    try {
      const res = await ai().models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: spoken }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
        } as any,
      });
      const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
      if (part?.inlineData?.data) {
        return Response.json({ audio: part.inlineData.data, mimeType: part.inlineData.mimeType || "audio/L16;rate=24000", model });
      }
      last = "No audio returned";
    } catch (e: any) {
      last = String(e?.message || e);
      if (!isBusyError(e)) break;
    }
  }
  const limit = /quota|429|RESOURCE_EXHAUSTED/i.test(last);
  return Response.json(
    { error: limit ? "AJ's voice has reached today's free limit. It comes back tomorrow." : "Voice is unavailable right now.", limit },
    { status: limit ? 429 : 500 },
  );
}
