# AJ: My AI Personal Assistant

Ajay's private AI personal assistant. She chats, talks on live voice/video calls, speaks English and Kannada,
shows real emotions, and does tasks: Google Meet scheduling, reminders, to-dos, Gmail drafts, images,
weather, web search, file reading, interview practice and a morning brief.

Built with Next.js 15 + Google Gemini (`@google/genai`).

## Features

| Feature | Where | Needs |
|---|---|---|
| Chat with AJ (English / ಕನ್ನಡ), emotions, moods | Chat | Gemini key |
| Live voice + video call (she can see your camera) | Call | Gemini key |
| Natural read-aloud voice (6 voices) | 🔊 buttons, Settings | Gemini key |
| Memory, contacts, to-dos, job tracker | About me, Today | nothing |
| Weather + morning brief | Today | nothing (Open-Meteo) |
| Read files and photos (PDF, images, text) | 📎 in Chat | Gemini key |
| Interview coach (chat or call) | 🎯 Interview practice | Gemini key |
| Google Meet / Calendar, reminders | Chat or Call | Google sign-in |
| Gmail summaries + reply drafts (never sends) | Chat or Call | Google sign-in |
| Image making | Chat or Call | nothing (free Pollinations; Gemini images if `IMAGE_PROVIDER=gemini` + billing) |
| Live web search with sources | Chat or Call | free Tavily key (`TAVILY_API_KEY`) |
| Install on phone | Browser menu → "Add to Home screen" | deployed (https) |

AJ asks before anything that affects other people (meetings with guests, moving or cancelling events).
She never sends email; she only saves drafts.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. On localhost the app opens without sign-in; Calendar and Gmail stay off until you connect Google.

## Settings file (`.env.local`, never commit it)

See `.env.example` for every value.

### 1. Gemini key
`GEMINI_API_KEY`. The free plan allows only about 20 requests a day per main model; AJ falls back to the lite models after that.
Billing (https://aistudio.google.com → **Set up billing**) removes the limit but is optional.

### 2. Google sign-in (Calendar + Gmail, and locking AJ to only you)
1. https://console.cloud.google.com → pick a project (or create "AJ Assistant").
2. **APIs & Services → Library**: enable **Google Calendar API** and **Gmail API**.
3. **OAuth consent screen**: External, app name "AJ", add yourself (`ALLOWED_EMAIL`) as a **Test user**.
4. **Credentials → Create credentials → OAuth client ID → Web application**.
   Authorised redirect URI: `http://localhost:3000/api/auth/callback` (add your live URL + `/api/auth/callback` later).
5. Put the client ID and secret in `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, restart, then Settings → **Connect Google**.

Once Google is set up, the deployed site only opens for `ALLOWED_EMAIL`.

### 3. AJ's photo
Save AJ's picture (from Google Flow) as `public/aj.png` (square works best). Until then a placeholder is shown.

## Notes
- Chats, memory, contacts, to-dos and jobs are stored in your browser only (not synced between phone and laptop yet).
- The morning brief appears the first time you open AJ after your brief time (Settings, default 09:00).
- Gemini doesn't allow explicit sexual content; AJ stays romantic and flirty but classy.
