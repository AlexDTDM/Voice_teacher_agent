"use client";

import type { CallState } from "@/lib/useRealtime";

type Props = { state: CallState; onStart: () => void; onEnd: () => void };

export default function CallButton({ state, onStart, onEnd }: Props) {
  const live = state === "listening" || state === "speaking";
  if (live) {
    return (
      <button className="pill end" onClick={onEnd}>
        End
      </button>
    );
  }
  return (
    <button className="pill" onClick={onStart} disabled={state === "connecting"}>
      {state === "connecting" ? "Connecting" : "Start"}
    </button>
  );
}
