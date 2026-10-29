# SM Dashboard: Unified WhatsApp & Instagram Inbox

A full-stack dashboard for managing WhatsApp and Instagram messaging from one
place: reply to chats, send rate-limited broadcasts, publish Instagram posts,
answer comments and DMs, and get an AI read on how a conversation is going.

<!-- Screenshots: add images to docs/screenshots/ and link them here, e.g.
![Inbox](docs/screenshots/inbox.png) -->

## Features

**WhatsApp**
- Link a number by scanning a QR code **in the browser**; unlink/relink with one click
- Live inbox: contacts, chats, message history and media (images, video, audio, documents)
- Send text and attachments, with live delivery status (sending → sent → delivered → read) and one-click retry on failure
- **Broadcasts** to many contacts through a rate-limited queue: configurable delay + random jitter, quiet hours, automatic retries, pause / resume / cancel with live progress
- Connection health in the UI (connected, reconnecting, not linked, service offline)

**Instagram** (Graph API, Business/Creator accounts)
- Connect via Facebook Login (OAuth) with automatic long-lived token refresh
- Feed sync, per-post insights, comment replies, DMs and post publishing
- Competitor monitoring via Business Discovery
- Real-time updates through **HMAC-SHA256-verified webhooks**

**AI chat analysis**
- Mood score and conversation summary using Llama 3.3 70B (Groq, with OpenRouter fallback)

**Security & UX**
- Email/password auth (bcrypt), JWT sessions in httpOnly cookies, route protection in `proxy.ts` plus server-side checks on every action, API route and private media file
- Responsive layout: separate list/chat screens and a details drawer on mobile

## Tech stack

| Layer | Tools |
|---|---|
| Web app | Next.js 16 (App Router, Server Actions, Proxy), React 19, TypeScript, Tailwind CSS 4 |
| Data | PostgreSQL (Neon), Prisma 7 with the `pg` driver adapter |
| WhatsApp | Baileys (WhatsApp Web multi-device protocol), long-running Node.js worker |
| Instagram | Instagram Graph API, Facebook Login, webhooks |
| AI | Groq / OpenRouter (Llama 3.3 70B) |
| Auth | bcrypt, jsonwebtoken, Zod validation |

## Architecture

```
 Browser ──► Next.js app ──────────────► PostgreSQL ◄────── WhatsApp worker ◄──► WhatsApp
             (pages, server actions,      (chats, queue,     (Baileys socket,
              upload + webhook routes)     session state)     send loop, heartbeat)
                  ▲
 Meta ────────────┘ Instagram webhooks (signature-verified)
```

The web app and the WhatsApp worker never call each other directly; they
coordinate through the database:

- **Outgoing messages** are written as `PENDING` rows; the worker sends them and updates their status.
- **Broadcasts** are queue jobs with one row per recipient; the worker sends one at a time with jittered delays.
- **Connection state** (QR code, status, heartbeat, unlink requests) lives in a single `WhatsAppSession` row, so the dashboard can show the QR code and tell when the worker is down.

## Getting started

**Prerequisites:** Node.js 22.6+ (the worker uses `--experimental-strip-types`) and a PostgreSQL database.

```bash
npm install
cp .env.example .env        # then fill in the values below
npx prisma db push          # create tables
npx prisma generate
```

Run the web app and the WhatsApp worker in two terminals:

```bash
npm run dev                 # http://localhost:3000
npm run whatsapp:worker
```

1. Open http://localhost:3000. The first visit asks you to create the owner account.
2. Scan the QR code shown on the dashboard from **WhatsApp → Linked devices → Link a device**.
3. Optionally connect Instagram from the Instagram page.

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `AUTH_SECRET` | yes | Signs login sessions; 32+ random characters (`openssl rand -hex 32`) |
| `GROQ_API_KEY` / `OPENROUTER_API_KEY` | for AI analysis | LLM provider key |
| `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET` | for Instagram | Meta app credentials |
| `INSTAGRAM_REDIRECT_URI` | for Instagram | OAuth callback, e.g. `http://localhost:3000/api/instagram/auth` |
| `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` | for Instagram | Must match the token set in the Meta webhook settings |
| `NEXT_PUBLIC_APP_URL` | for Instagram | Public base URL (an ngrok URL while testing webhooks) |
| `WHATSAPP_AUTH_DIR` | no | WhatsApp login storage, default `.data/baileys-auth` |
| `WHATSAPP_HISTORY_CHAT_LIMIT` / `_CONTACT_LIMIT` / `_MESSAGE_LIMIT` | no | Caps per history-sync batch |
| `WHATSAPP_HISTORY_BACKFILL_ENABLED` / `_CHAT_LIMIT` / `_MESSAGE_LIMIT` | no | Older-history backfill on connect |

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js app |
| `npm run whatsapp:worker` | WhatsApp worker (QR linking, sync, sending) |
| `npm run instagram:subscribe-webhook` | Subscribe the connected Facebook Page to Instagram messaging webhooks |
| `npm run db:reset -- --yes` | **Delete all data** and the local WhatsApp login (stop the worker first) |

## Limitations

- **WhatsApp uses Baileys, an unofficial WhatsApp Web client.** Automated or bulk messaging can get a number restricted by WhatsApp, which is why broadcasts are rate-limited with jitter and quiet hours. For production use, move to the official WhatsApp Cloud API (the schema already models multiple providers).
- Single-tenant: one owner account, one WhatsApp number and one Instagram account.
- Media is stored on local disk under `public/uploads/` (served only to signed-in users); cloud object storage would be needed for a multi-server deployment.
- Live updates use periodic refresh rather than WebSockets / SSE.
