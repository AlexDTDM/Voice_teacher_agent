# Voice agent web app — plan

Goal: one page, one button. Click it, a speech-to-speech conversation with an OpenAI Realtime voice agent starts. A blue orb in the center of the screen reacts to the voice. Minimal, single-screen visual style.

Assumption (from the folder name): the agent persona is a German teacher. Persona lives in one string in the token route and is easy to change.

## 1. Stack

- Next.js 15 (App Router) + TypeScript + Tailwind. One deployable unit: the page and the token API route.
- Raw browser WebRTC (no `@openai/agents` SDK). The documented flow is ~40 lines and gives direct access to the mic and remote audio streams, which we need to drive the orb animation with a Web Audio `AnalyserNode`.
- No database, no auth, no state library. React `useState` + one custom hook.

## 2. Architecture

```
Browser                                  Next.js server              OpenAI
--------                                 --------------              ------
click "Start"
  -> GET /api/token  ─────────────────>  POST /v1/realtime/client_secrets  (uses OPENAI_API_KEY, server only)
  <- { value: "ek_..." }  <────────────  session config (model, voice, instructions, VAD)
RTCPeerConnection
  + mic track (getUserMedia)
  + ontrack -> <audio autoplay>
  + data channel "oai-events"
  POST /v1/realtime/calls (SDP offer, Bearer ek_...)  ─────────────────────────────>  SDP answer
  audio flows both ways over WebRTC; JSON events flow over the data channel
```

Session config sent from the server when minting the key:

```json
{
  "session": {
    "type": "realtime",
    "model": "gpt-realtime-2.1",
    "instructions": "<German teacher persona>",
    "audio": {
      "input":  { "turn_detection": { "type": "semantic_vad", "eagerness": "auto", "create_response": true, "interrupt_response": true } },
      "output": { "voice": "marin" }
    }
  },
  "expires_after": { "anchor": "created_at", "seconds": 600 }
}
```

Client events we send: `response.create` once after connect (so the agent greets first).
Server events we read: `input_audio_buffer.speech_started` / `speech_stopped`, `response.output_audio_transcript.delta` / `done`, `response.done`, `error`.

## 3. Files

```
german_teacher/
  .env.local                      OPENAI_API_KEY=...   (gitignored)
  app/
    layout.tsx                    Inter Tight font, metadata
    page.tsx                      the single screen
    globals.css                   design tokens, gradient, keyframes
    api/token/route.ts            mints ephemeral key (server only)
  components/
    Orb.tsx                       the blue circle, driven by audio level + state
    CallButton.tsx                pill button: Start / End
    Captions.tsx                  (v1.1) live transcript line under the orb
  lib/
    useRealtime.ts                hook: connect / disconnect / state / audio levels / events
    persona.ts                    the instructions string
```

## 4. The hook: `useRealtime`

State machine: `idle -> connecting -> listening <-> speaking -> idle` (+ `error`).

- `connect()`: fetch token, getUserMedia, build RTCPeerConnection, data channel, SDP exchange. Set `connecting` until data channel `open`, then send `response.create` and go `listening`.
- `disconnect()`: close data channel, stop mic tracks, close peer connection, reset to `idle`.
- Audio levels: one `AudioContext`, two `AnalyserNode`s (mic stream and remote stream). A `requestAnimationFrame` loop computes RMS and exposes `inputLevel` / `outputLevel` (0..1) via a ref so the orb never causes React re-renders per frame.
- Event handling: `speech_started` -> `listening`; `response.output_audio.delta` or first output level > threshold -> `speaking`; `response.done` -> `listening`; `error` -> `error`.
- Cleanup on unmount and on `pagehide`.

## 5. UI and design 

Tokens
- Font: "Inter Tight", fallback Inter / system sans. Micro labels in a mono font (JetBrains Mono), uppercase, tracking 0.15em, 11px.
- Hero background: full-bleed deep blue gradient `#0B2A6F -> #1B5FD6`, with one large soft radial glow (`#7FB3E6`, ~40% opacity, blur 120px) that drifts slowly (20s loop). .
- Text on hero: white / white 70%.
- Cream `#F2E9D6` and navy `#0E2F7E` are the secondary palette. Used only for the small footer strip and the hover/pressed state of the button, so the page stays one dark blue screen.
- Button: pill, 1px border white/40%, transparent fill, white text, hover fill white/10%. "End" state: same pill, subtle red/25% border.
- Nav: wordmark top-left, nothing else. "SCROLL"-style mono micro label under the orb shows the state: `TAP TO TALK`, `CONNECTING`, `LISTENING`, `SPEAKING`.

Layout
- 100vh, orb dead center (flex), button 32px below the orb, state label 12px below the button. Works at 375px wide.

The orb (`Orb.tsx`)
- A 220px circle: radial gradient light-blue center to blue edge, plus an outer glow (box-shadow + blurred pseudo-element).
- Idle: slow breathing scale 1.0 -> 1.04 over 4s.
- Connecting: thin rotating ring around the orb.
- Listening: scale = 1 + inputLevel * 0.25, glow intensity follows level. Reads mic.
- Speaking: scale = 1 + outputLevel * 0.35, brighter core. Reads remote audio.
- Implemented with CSS transforms updated from the rAF loop via `style.transform` on a ref (no per-frame React state). Respects `prefers-reduced-motion` (levels still change size, drift and breathing stop).

## 6. Build order (each step has a check)

1. Scaffold Next.js + Tailwind, add font, `.env.local`, `.gitignore`. -> `npm run dev` renders a blank page.
2. `app/api/token/route.ts`. -> `curl localhost:3000/api/token` returns `{ value: "ek_..." }`.
3. `useRealtime` with connect/disconnect, no UI polish. -> Click a plain button, hear the agent greet in German, reply, hear it answer. Interrupting it mid-sentence works.
4. Design pass: layout, gradient, button, state label. -> Screenshot at 1440 and 375 looks like the mockup.
5. Orb with audio-reactive animation. -> Orb visibly pulses with my voice and with the agent's voice; idle breathes.
6. Error paths: mic permission denied, token route failing, connection dropped. -> Each shows a short message under the orb and returns to `idle`.
7. Deploy to Vercel with `OPENAI_API_KEY` set. -> Works on phone over HTTPS (mic needs a secure context).

## 7. Out of scope for v1 (possible later)

- Live captions (`Captions.tsx`), tools / function calling, conversation history, user accounts, rate limiting on the token route, custom voice.

## 8. Risks

- Mobile Safari autoplay: the `<audio>` element must be created inside the click handler so playback is allowed.
- Token route is open: anyone hitting it can spend your key for 10 minutes. Fine for a personal demo; add a rate limit or a shared secret before making it public.
- Docs URLs change often; the flow above is from the current docs (Sept 2026): `POST /v1/realtime/client_secrets`, `POST /v1/realtime/calls`, model `gpt-realtime-2.1`.
