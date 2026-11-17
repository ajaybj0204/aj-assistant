"use client";

// Glow colour for each emotion AJ can show.
export const EMOTION_COLORS: Record<string, string> = {
  happy: "#ffc75a",
  sweet: "#ff9ec7",
  romantic: "#ff4f8b",
  playful: "#ff9a3d",
  shy: "#ffb3c6",
  classy: "#c9b6ff",
  smart: "#5ee7ff",
  angry: "#ff4545",
  sad: "#7d95ff",
  excited: "#ffe066",
  calm: "#7be0c3",
  caring: "#ff8fa3",
  surprised: "#b7f05a",
  thinking: "#5ee7ff",
  listening: "#7be0c3",
};

export const EMOTION_EMOJI: Record<string, string> = {
  happy: "😊", sweet: "🥰", romantic: "💗", playful: "😜", shy: "🙈", classy: "✨", smart: "🧠",
  angry: "😤", sad: "🥺", excited: "🤩", calm: "😌", caring: "🤗", surprised: "😮", thinking: "💭", listening: "👂",
};

// Which face from AJ's character sheet she shows for each feeling.
const FACE: Record<string, string> = {
  happy: "smile", sweet: "smile", romantic: "smile", playful: "smile", shy: "smile", excited: "smile", caring: "smile",
  smart: "thoughtful", sad: "thoughtful", thinking: "thoughtful",
  angry: "confident",
  calm: "neutral", listening: "neutral",
  surprised: "front34",
  classy: "portrait",
};
const FACES = ["portrait", "smile", "thoughtful", "confident", "neutral", "front34"];

export function moodColor(emotion?: string) {
  return EMOTION_COLORS[emotion || ""] || EMOTION_COLORS.calm;
}

/**
 * AJ's face. Her expression cross-fades with her emotion; the halo glows in her mood colour
 * and ripples with her voice level while she talks.
 */
export function Avatar({
  size = 48,
  emotion = "calm",
  level = 0,
  active = false,
  halo = false,
}: {
  size?: number;
  emotion?: string;
  level?: number;
  active?: boolean;
  halo?: boolean;
}) {
  const color = moodColor(emotion);
  const face = FACE[emotion] || "portrait";
  return (
    <div
      className={`avatar ${active ? "is-active" : ""} ${halo ? "has-halo" : ""}`}
      style={{ width: size, height: size, ["--mood" as any]: color, ["--lvl" as any]: level.toFixed(3) }}
    >
      {halo && (
        <>
          <span className="ring r1" />
          <span className="ring r2" />
          <span className="ring r3" />
        </>
      )}
      <div className="face">
        {FACES.map((f) => (
          <img key={f} src={`/aj/${f}.jpg`} alt={f === face ? "AJ" : ""} className={f === face ? "on" : ""} draggable={false} />
        ))}
      </div>
    </div>
  );
}
