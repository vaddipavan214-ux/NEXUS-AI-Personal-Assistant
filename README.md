# Jarvis Control Center

A voice-first AI operating system powered by **Groq** and **Convex**. Talk naturally with Jarvis — it connects to your real services (Gmail, Google Calendar, Notion), performs actions, remembers context, and continuously updates a live dashboard while it works.

## Architecture

- **Next.js (App Router)** — UI plus a server-side route handler (`src/app/api/chat`) that executes conversations with Groq and dispatches tool calls securely without exposing API keys to the browser.
- **Groq API (`llama-3.3-70b-versatile`)** — Ultra-fast, free-tier tool-calling LLM engine running at ~280+ tokens/second.
- **Voice Pipeline (Google Chrome)** — Speech-to-text via Chrome's native Web Speech API (`webkitSpeechRecognition`), Web Audio Analyser for live 3D Canvas Orb reactivity, and browser SpeechSynthesis with natural British English persona and instant barge-in interruption.
- **Convex** — The shared reactive brain. Transcript, memory, timeline, dashboard cards, connections, and current objective are all reactive queries.
- **Composio** — Real OAuth integrations. Jarvis executes Gmail, Google Calendar, and Notion tools server-side in Convex actions.
- **Convex Auth** — Email + password authentication scoping every table per user.

```
Browser (Chrome)
  ├─ Speech-to-Text (Web Speech API) + Web Audio RMS
  │    │
  │    ▼
  ├─ POST /api/chat (Bearer Convex Auth JWT)
  │    │
  │    ▼
  │  Groq (llama-3.3-70b-versatile)
  │    │
  │    ├─ Tool Calls ──▶ Convex action (api.tools.execute) ──▶ Composio (Gmail/Calendar/Notion)
  │    │                     │
  │    │                     └─▶ Writes memory / timeline / dashboard / objective
  │    │                               └─▶ Reactive queries update all tabs
  │    ▼
  └─ Text-to-Speech (SpeechSynthesis) + 3D Canvas Orb modulation
```

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Environment** — configure `.env.local`:
   - `GROQ_API_KEY` — Your Groq API key from https://console.groq.com (free tier)
   - Convex variables are configured automatically by `npx convex dev`

   Set the required environment variables on the Convex deployment:

   ```bash
   npx convex env set COMPOSIO_API_KEY <your-composio-key>
   npx convex env set SITE_URL http://localhost:3000
   ```

3. **Run** (two processes):

   ```bash
   npx convex dev     # Convex backend
   npm run dev        # Next.js on http://localhost:3000
   ```

4. Open `http://localhost:3000` in **Google Chrome**, sign in, click **Activate Jarvis**, grant microphone access, and speak.

## Things to try

- "What can you connect to?"
- "Connect my Gmail." — complete sign-in popup, Jarvis confirms when linked
- "Check my unread emails."
- "What meetings do I have today?"
- "Create a meeting tomorrow at 2 PM called design review."
- "Remember that my favorite editor is Cursor."
- "What do you know about me?"
- "Track a task: ship the landing page."
- "Jarvis, prepare me for today." — the daily briefing
- Interrupt Jarvis mid-sentence — it stops speaking immediately and listens to your new instruction

*(Note: The original OpenAI Realtime implementation is preserved and recoverable in `src/hooks/useOpenAIRealtimeSession.ts`.)*
