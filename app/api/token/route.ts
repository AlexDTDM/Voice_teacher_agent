import { NextResponse } from "next/server";
import { PERSONA, VOICE } from "@/lib/persona";

// Mints a short-lived client secret for the browser. The real API key never leaves the server.
export async function POST() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not set. Add it to .env.local and restart the dev server." },
      { status: 500 },
    );
  }

  const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      expires_after: { anchor: "created_at", seconds: 600 },
      session: {
        type: "realtime",
        model: "gpt-realtime-2.1",
        instructions: PERSONA,
        audio: {
          input: {
            turn_detection: {
              type: "semantic_vad",
              eagerness: "auto",
              create_response: true,
              interrupt_response: true,
            },
          },
          output: { voice: VOICE },
        },
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `OpenAI ${res.status}: ${text}` }, { status: 502 });
  }

  const data = await res.json();
  return NextResponse.json({ value: data.value, expires_at: data.expires_at });
}
