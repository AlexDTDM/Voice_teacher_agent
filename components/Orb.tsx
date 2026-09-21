"use client";

import { useEffect, useRef } from "react";
import type { CallState, Levels } from "@/lib/useRealtime";

type Props = { state: CallState; levels: React.RefObject<Levels> };

// The blue circle. Idle: CSS breathing. Listening/speaking: scaled every frame from audio levels.
export default function Orb({ state, levels }: Props) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = el.current;
    if (!node) return;
    if (state !== "listening" && state !== "speaking") {
      node.style.transform = "";
      return;
    }
    let raf = 0;
    let smoothed = 0;
    const tick = () => {
      const { input, output } = levels.current;
      const target = state === "speaking" ? output * 0.35 : input * 0.25;
      smoothed += (target - smoothed) * 0.2;
      node.style.transform = `scale(${1 + smoothed})`;
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [state, levels]);

  const cls = state === "idle" || state === "error" ? "idle" : state;

  return (
    <div className="relative">
      {state === "connecting" && <div className="ring" />}
      <div ref={el} className={`orb ${cls}`} />
    </div>
  );
}
