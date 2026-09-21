"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type CallState = "idle" | "connecting" | "listening" | "speaking" | "error";

// Audio levels are written to this ref every animation frame, never through React state.
export type Levels = { input: number; output: number };

type ServerEvent = { type: string; error?: { message?: string } };

const SDP_URL = "https://api.openai.com/v1/realtime/calls";

// Hard cap on a single call, counted from the moment the connection opens.
export const MAX_CALL_SECONDS = 180;

function rms(analyser: AnalyserNode, buf: Uint8Array<ArrayBuffer>): number {
  analyser.getByteTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = (buf[i] - 128) / 128;
    sum += v * v;
  }
  // Scale so normal speech lands around 0.3–0.8.
  return Math.min(1, Math.sqrt(sum / buf.length) * 4);
}

export function useRealtime() {
  const [state, setState] = useState<CallState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(MAX_CALL_SECONDS);
  const levels = useRef<Levels>({ input: 0, output: 0 });
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const pc = useRef<RTCPeerConnection | null>(null);
  const dc = useRef<RTCDataChannel | null>(null);
  const mic = useRef<MediaStream | null>(null);
  const audioEl = useRef<HTMLAudioElement | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const raf = useRef<number>(0);

  const disconnect = useCallback(() => {
    cancelAnimationFrame(raf.current);
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    dc.current?.close();
    dc.current = null;
    mic.current?.getTracks().forEach((t) => t.stop());
    mic.current = null;
    pc.current?.close();
    pc.current = null;
    if (audioEl.current) {
      audioEl.current.srcObject = null;
      audioEl.current.remove();
      audioEl.current = null;
    }
    ctx.current?.close();
    ctx.current = null;
    levels.current = { input: 0, output: 0 };
    setState("idle");
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    setState("connecting");
    try {
      // Create the audio element inside the click handler so mobile Safari allows playback.
      const el = document.createElement("audio");
      el.autoplay = true;
      document.body.appendChild(el);
      audioEl.current = el;

      const tokenRes = await fetch("/api/token", { method: "POST" });
      const tokenJson = await tokenRes.json();
      if (!tokenRes.ok) throw new Error(tokenJson.error ?? "Token request failed");
      const ephemeralKey: string = tokenJson.value;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mic.current = stream;

      const ac = new AudioContext();
      ctx.current = ac;
      const inAnalyser = ac.createAnalyser();
      inAnalyser.fftSize = 512;
      ac.createMediaStreamSource(stream).connect(inAnalyser);
      const outAnalyser = ac.createAnalyser();
      outAnalyser.fftSize = 512;

      const peer = new RTCPeerConnection();
      pc.current = peer;
      peer.ontrack = (e) => {
        el.srcObject = e.streams[0];
        ac.createMediaStreamSource(e.streams[0]).connect(outAnalyser);
      };
      peer.addTrack(stream.getTracks()[0], stream);

      const channel = peer.createDataChannel("oai-events");
      dc.current = channel;
      channel.onopen = () => {
        // Ask the agent to speak first (the greeting and the menu).
        channel.send(JSON.stringify({ type: "response.create" }));
        setState("listening");
        // Start the hard time limit.
        const deadline = Date.now() + MAX_CALL_SECONDS * 1000;
        setRemaining(MAX_CALL_SECONDS);
        timer.current = setInterval(() => {
          const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
          setRemaining(left);
          if (left <= 0) {
            disconnect();
            setError(`Time limit reached (${MAX_CALL_SECONDS}s)`);
          }
        }, 250);
      };
      channel.onmessage = (msg) => {
        const ev: ServerEvent = JSON.parse(msg.data);
        switch (ev.type) {
          case "input_audio_buffer.speech_started":
            setState("listening");
            break;
          case "response.output_audio.delta":
            setState("speaking");
            break;
          case "response.done":
            setState("listening");
            break;
          case "error":
            setError(ev.error?.message ?? "Realtime error");
            break;
        }
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "failed" || peer.connectionState === "disconnected") {
          setError("Connection lost");
          disconnect();
          setState("error");
        }
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const sdpRes = await fetch(SDP_URL, {
        method: "POST",
        body: offer.sdp,
        headers: { Authorization: `Bearer ${ephemeralKey}`, "Content-Type": "application/sdp" },
      });
      if (!sdpRes.ok) throw new Error(`SDP exchange failed (${sdpRes.status})`);
      await peer.setRemoteDescription({ type: "answer", sdp: await sdpRes.text() });

      const buf = new Uint8Array(inAnalyser.fftSize) as Uint8Array<ArrayBuffer>;
      const tick = () => {
        levels.current = { input: rms(inAnalyser, buf), output: rms(outAnalyser, buf) };
        raf.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      disconnect();
      setError(
        message.includes("Permission") || message.includes("NotAllowed")
          ? "Microphone access was denied"
          : message,
      );
      setState("error");
    }
  }, [disconnect]);

  useEffect(() => {
    window.addEventListener("pagehide", disconnect);
    return () => {
      window.removeEventListener("pagehide", disconnect);
      disconnect();
    };
  }, [disconnect]);

  return { state, error, remaining, levels, connect, disconnect };
}
