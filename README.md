This is a social messaging dashboard built with Next.js. The WhatsApp MVP uses
Baileys as a long-running worker process that connects through WhatsApp Web
linked devices.

## Sign-in

The dashboard requires a login. Set `AUTH_SECRET` in `.env` to a random string of
at least 32 characters (`openssl rand -hex 32`). On first visit, `/login` asks you
to create the owner account; after that it is a normal sign-in page.

## WhatsApp Worker

Make sure `DATABASE_URL` is set in `.env`, then create/update the database
tables:

```bash
npx prisma db push
npx prisma generate
```

Start the WhatsApp worker in a separate terminal:

```bash
npm run whatsapp:worker
```

On first run it shows a QR code on the dashboard home page (and in the terminal). Scan it from WhatsApp:

```txt
WhatsApp > Linked devices > Link a device
```

The local Baileys auth/session files are stored in:

```txt
.data/baileys-auth
```

That folder is ignored by Git and should not be committed. To relink the account,
use "Unlink this phone" in the dashboard's details panel; the worker clears that
folder and shows a new QR code.

When connected, incoming WhatsApp messages are persisted into the dashboard
database as contacts, conversations, and messages.

The worker also captures small history sync chunks from Baileys. Defaults:

```txt
WHATSAPP_HISTORY_CHAT_LIMIT=250
WHATSAPP_HISTORY_CONTACT_LIMIT=250
WHATSAPP_HISTORY_MESSAGE_LIMIT=100
```

These limits are applied per history sync event to avoid importing a huge archive
while the product is still in MVP mode.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
