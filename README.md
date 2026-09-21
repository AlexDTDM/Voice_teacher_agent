# Lena, a German voice teacher

One page, one button. Speech-to-speech with OpenAI's Realtime API over WebRTC.

## Run locally

```bash
cp .env.example .env.local   # then put your OpenAI key in it
npm install
npm run dev
```

Open http://localhost:3000, click **Start**, allow the microphone. Lena greets you and offers two modes: learn words together, or a conversation in a situation (first date, restaurant, asking directions).

Voice commands, any time:
- "I didn't understand": she repeats her last sentence word by word.
- "stop role play": ends the scene and gives feedback.
- "menu": back to the opening question.
- "goodbye": wrap up.

## Where things live

- `lib/persona.ts` the system prompt, voice, teacher name, command phrases.
- `app/api/token/route.ts` mints the ephemeral key server-side. The real key never reaches the browser.
- `lib/useRealtime.ts` WebRTC connection, events, audio levels.
- `components/Orb.tsx` the blue circle, driven by mic and agent audio levels.
- `app/globals.css` design tokens, gradient, orb and button styles.
