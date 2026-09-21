"use client";

import Orb from "@/components/Orb";
import CallButton from "@/components/CallButton";
import { useRealtime } from "@/lib/useRealtime";

const LABELS = {
  idle: "Tap to talk",
  connecting: "Connecting",
  listening: "Listening",
  speaking: "Speaking",
  error: "Something went wrong",
} as const;

export default function Home() {
  const { state, error, remaining, levels, connect, disconnect } = useRealtime();
  const live = state === "listening" || state === "speaking";
  const clock = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;

  return (
    <main className="hero">
      <header className="relative z-10 flex items-center justify-between px-8 py-6">
        <span className="text-lg font-semibold tracking-tight">lena</span>
        <span className="mono-label text-white/60">German teacher</span>
      </header>

      <section className="relative z-10 flex min-h-[calc(100dvh-80px)] flex-col items-center justify-center gap-8 px-4 pb-20">
        <Orb state={state} levels={levels} />
        <CallButton state={state} onStart={connect} onEnd={disconnect} />
        <p className="mono-label text-white/60">
          {error ?? (live ? `${LABELS[state]} · ${clock}` : LABELS[state])}
        </p>
      </section>
    </main>
  );
}
