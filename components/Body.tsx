"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Full-body AJ. Plays short clips made in Google Flow:
 *  - greeting: waves hello (plays once when she appears)
 *  - idle:     breathing / small movement loop while she waits
 *  - talking:  talking loop while she speaks
 * Clips live in /public/aj/body/. Until they exist, the still photo is shown.
 */
export type BodyState = "idle" | "talking";

const CLIPS = { greeting: "/aj/body/greeting.mp4", idle: "/aj/body/idle.mp4", talking: "/aj/body/talking.mp4" };
const STILL = "/aj/body/still.jpg";

export function Body({
  state = "idle",
  greet = false,
  greetKey = 0,
  onTap,
  className = "",
}: {
  state?: BodyState;
  greet?: boolean;
  greetKey?: number; // change it to make her wave again
  onTap?: () => void;
  className?: string;
}) {
  const [greeting, setGreeting] = useState(greet);
  useEffect(() => {
    if (greetKey) setGreeting(true);
  }, [greetKey]);
  const [ready, setReady] = useState<Record<string, boolean>>({});
  const refs = {
    greeting: useRef<HTMLVideoElement>(null),
    idle: useRef<HTMLVideoElement>(null),
    talking: useRef<HTMLVideoElement>(null),
  };
  const showing = greeting ? "greeting" : state;
  const [wave, setWave] = useState(0); // restarts the wave when it's asked for again

  // Play the clip that should be visible, pause the others (saves battery on phones).
  useEffect(() => {
    for (const [name, ref] of Object.entries(refs)) {
      const v = ref.current;
      if (!v) continue;
      if (name === showing) {
        if (name === "greeting") v.currentTime = 0;
        void wave;
        v.play().catch(() => {});
      } else {
        v.pause();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showing, greetKey]);

  return (
    <div
      className={`body ${onTap ? "is-tappable" : ""} ${className}`}
      data-state={showing}
      onClick={onTap ? () => { setWave((w) => w + 1); onTap(); } : undefined}
      role={onTap ? "button" : undefined}
      aria-label={onTap ? "Say hi to AJ" : undefined}
    >
      <img className="body-still" src={STILL} alt="AJ" draggable={false} />
      {(Object.keys(CLIPS) as (keyof typeof CLIPS)[]).map((name) => (
        <video
          key={name}
          ref={refs[name]}
          className={`body-clip ${name === showing && ready[name] ? "on" : ""}`}
          src={CLIPS[name]}
          poster={STILL}
          muted
          playsInline
          preload="auto"
          loop={name !== "greeting"}
          autoPlay={name === showing}
          onCanPlay={() => setReady((r) => (r[name] ? r : { ...r, [name]: true }))}
          onEnded={name === "greeting" ? () => setGreeting(false) : undefined}
          onError={name === "greeting" ? () => setGreeting(false) : undefined}
        />
      ))}
    </div>
  );
}
