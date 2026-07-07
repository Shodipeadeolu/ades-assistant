# Ade's Assistant

A personal AI assistant PWA — installable on phone and desktop. Single Node.js/Express app, no database. `persona.md` is the assistant's system prompt.

## Get an Anthropic API key
1. Go to https://console.anthropic.com
2. Sign up / log in, add billing, then create an API key under **API Keys**.
3. Copy it — you'll paste it into `.env` below.

## Run locally
```
npm install
cp .env.example .env
```
Edit `.env`:
```
ANTHROPIC_API_KEY=sk-ant-...
APP_PASSWORD=choose-a-password
MODEL=claude-sonnet-5
PORT=3000
```
Then:
```
npm start
```
Open http://localhost:3000. The server refuses to start if `ANTHROPIC_API_KEY` or `APP_PASSWORD` is missing.

PWA install won't work on `localhost` from a phone (needs HTTPS) — for phone install, deploy first (below). Desktop Chrome/Edge can install straight from `localhost`.

## How it works
- `index.js` — Express server. `POST /api/chat` takes `{messages}`, sends `persona.md` + current date/time as the system prompt to the Claude API, returns `{reply}`. Only the last 40 messages are sent. `POST /api/auth` and the Bearer-token check protect it: 10 wrong passwords from one IP triggers a 15-minute lockout.
- `public/` — static frontend: password gate, chat UI, service worker (`sw.js`) caching the app shell for offline load, `manifest.json` + icons for installability.
- Conversation history and the password live in the browser's `localStorage` — no server-side storage. "New chat" clears history.

## Deploying (needed for phone install — PWA requires HTTPS)

### Railway / Render / Fly.io
All three build directly from this repo's `Dockerfile`.
- Push this folder to a GitHub repo.
- Create a new service on Railway/Render/Fly, point it at the repo.
- Set env vars `ANTHROPIC_API_KEY`, `APP_PASSWORD`, `MODEL` (optional) in the service's dashboard — do **not** commit `.env`.
- They provide HTTPS automatically on their `*.up.railway.app` / `*.onrender.com` / `*.fly.dev` domain.

### Your own VPS + Caddy
```
docker build -t ade-assistant .
docker run -d --name ade-assistant --restart unless-stopped \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -e APP_PASSWORD=choose-a-password \
  -p 127.0.0.1:3000:3000 \
  ade-assistant
```
Caddyfile:
```
assistant.yourdomain.com {
  reverse_proxy 127.0.0.1:3000
}
```
Caddy handles the TLS certificate automatically. HTTPS is required for the PWA install prompt and service worker on real devices.

## Installing the PWA
- **iPhone (Safari)**: open the site → Share icon → "Add to Home Screen".
- **Android (Chrome)**: open the site → menu (⋮) → "Install app" (or a banner appears automatically).
- **Desktop (Chrome/Edge)**: open the site → install icon in the address bar → "Install".

## Notes
- Single instance only: rate-limit/lockout state is in memory and resets on restart. Fine for personal use, not for a multi-instance deployment.
- If you're behind a reverse proxy other than what's shown above, make sure it forwards the real client IP (`X-Forwarded-For`) so the rate limiter tracks the right address — `trust proxy` is already enabled in `index.js`.
