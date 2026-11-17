import { FunctionCallingConfigMode, type Content, type Part } from "@google/genai";
import { ai, withModelFallback } from "@/lib/gemini";
import { getSession } from "@/lib/google";
import { splitEmotion, systemPrompt } from "@/lib/prompts";
import { runToolSafe, TOOL_DECLARATIONS } from "@/lib/tools";
import type { ChatRequest, ChatResponse, ClientAction, PendingAction } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_STEPS = 6;
// Replies that announce an action ("checking now", "let me look") instead of doing it.
const ANNOUNCES_ACTION = /\b(checking|let me (actually )?(check|look|see|find|pull|get|search)|i'?ll (check|look|search|find)|give me a (sec|second|moment|minute)|one (sec|second|moment)|looking (it )?up|on it|right away)\b|ನೋಡ್ತೀನಿ|ಚೆಕ್ ಮಾಡ್ತೀನಿ|ಒಂದು ನಿಮಿಷ/i;
const CLAIMS_ACTION = /\b(added|saved|scheduled|set (a|the|your)? ?reminder|created|remembered|drafted|noted it|noted|put it on|i'll remember|i will remember|i'll keep|will make sure)\b|ಸೇರಿಸಿದ್ದೀನಿ|ಸೇವ್ ಮಾಡಿದ್ದೀನಿ|ಸೆಟ್ ಮಾಡಿದ್ದೀನಿ/i;

export async function POST(req: Request) {
  let body: ChatRequest;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  const timeZone = body.timeZone || "Asia/Kolkata";
  const session = await getSession();

  // Last 30 turns are enough context; attachments go on the newest message.
  const history = body.messages.slice(-30);
  const contents: Content[] = history.map((m, i) => {
    const parts: Part[] = [{ text: m.text || " " }];
    if (i === history.length - 1 && m.role === "user") {
      for (const a of body.attachments || []) parts.push({ inlineData: { mimeType: a.mimeType, data: a.data } });
    }
    return { role: m.role === "assistant" ? "model" : "user", parts };
  });

  const out: ChatResponse = { reply: "", emotion: "calm", images: [], sources: [], actions: [] as ClientAction[], confirm: [] as PendingAction[], toolsUsed: [] };
  const system = systemPrompt({ lang: body.lang, mode: body.mode, mood: body.mood, timeZone, context: body.context });
  if (!session) {
    contents.unshift(
      { role: "user", parts: [{ text: "(System note: Ajay's Google account is not connected yet, so Calendar and Gmail tools will fail. If he asks for those, tell him to tap 'Connect Google' in Settings.)" }] },
      { role: "model", parts: [{ text: "[emotion: calm] Understood." }] },
    );
  }

  let nudged = false;
  let forceTool = false;
  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const res = await withModelFallback((model) =>
        ai().models.generateContent({
          model,
          contents,
          config: {
            systemInstruction: system,
            tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
            temperature: 0.9,
            // After a nudge, force a tool call so the task really happens.
            ...(forceTool ? { toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.ANY } } } : {}),
          },
        }),
      );
      const calls = res.functionCalls || [];
      const modelContent = res.candidates?.[0]?.content;
      if (!calls.length) {
        // Safety net: weaker backup models sometimes claim a task is done without calling a tool.
        // If the reply claims an action but no tool ran, ask the model once more to actually do it.
        const said = res.text || "";
        if (!out.toolsUsed.length && !nudged && (CLAIMS_ACTION.test(said) || ANNOUNCES_ACTION.test(said))) {
          nudged = true;
          forceTool = true;
          if (modelContent) contents.push(modelContent);
          contents.push({ role: "user", parts: [{ text: "(System: you only talked about it; no tool was called, so nothing happened. Call the right tool now to actually do it.)" }] });
          continue;
        }
        const { emotion, text } = splitEmotion(res.text || "");
        out.reply = text;
        out.emotion = emotion;
        break;
      }
      forceTool = false;
      if (modelContent) contents.push(modelContent);
      const responses: Part[] = [];
      for (const call of calls) {
        const r = await runToolSafe(call.name || "", call.args, { session, timeZone, attachments: body.attachments });
        out.toolsUsed.push(call.name || "");
        if (r.actions) out.actions.push(...r.actions);
        if (r.confirm) out.confirm.push(r.confirm);
        if (r.images) out.images.push(...r.images);
        if (r.sources) out.sources.push(...r.sources);
        responses.push({ functionResponse: { id: call.id, name: call.name, response: r.result } });
      }
      contents.push({ role: "user", parts: responses });
    }
    if (!out.reply) {
      out.reply = body.lang === "kn" ? "ಸರಿ, ಮಾಡಿದ್ದೀನಿ." : "Done.";
    }
    return Response.json(out);
  } catch (e: any) {
    const busy = /high demand|overloaded|503|429/i.test(String(e?.message));
    return Response.json(
      {
        error: busy
          ? "Gemini is very busy right now. Please try again in a minute."
          : `Something went wrong: ${String(e?.message || e).slice(0, 300)}`,
      },
      { status: 500 },
    );
  }
}
