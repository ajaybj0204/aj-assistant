import { Modality } from "@google/genai";
import { ai, DEFAULT_VOICE, LIVE_MODEL, VOICES } from "@/lib/gemini";
import { systemPrompt } from "@/lib/prompts";
import { TOOL_DECLARATIONS } from "@/lib/tools";
import type { Lang, Mode, Mood, UserContext } from "@/lib/types";

export const runtime = "nodejs";

// Creates a short-lived, single-use token so the browser can talk to Gemini Live
// without ever seeing the real API key. The call settings are locked into the token.
export async function POST(req: Request) {
  const b = (await req.json()) as {
    lang: Lang;
    mode: Mode;
    mood: Mood;
    voice?: string;
    timeZone: string;
    context: UserContext;
    affective?: boolean;
  };
  const voiceName = VOICES.some((v) => v.id === b.voice) ? b.voice! : DEFAULT_VOICE;
  const config: any = {
    responseModalities: [Modality.AUDIO],
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
    systemInstruction: systemPrompt({ lang: b.lang, mode: b.mode, mood: b.mood, timeZone: b.timeZone, context: b.context, voice: true }),
    tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
    inputAudioTranscription: {},
    outputAudioTranscription: {},
  };
  // Emotional-tone mode is only on some voice models; turn on with GEMINI_LIVE_AFFECTIVE=1.
  if (process.env.GEMINI_LIVE_AFFECTIVE === "1" && b.affective !== false) config.enableAffectiveDialog = true;

  try {
    const now = Date.now();
    const token = await ai().authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(now + 30 * 60_000).toISOString(),
        newSessionExpireTime: new Date(now + 2 * 60_000).toISOString(),
        liveConnectConstraints: { model: LIVE_MODEL, config },
        httpOptions: { apiVersion: "v1alpha" },
      },
    });
    return Response.json({ token: token.name, model: LIVE_MODEL, voice: voiceName });
  } catch (e: any) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
