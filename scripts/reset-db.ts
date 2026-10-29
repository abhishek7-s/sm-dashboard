// Wipes ALL dashboard data (every table, including users) and the local
// WhatsApp login. Tables are kept, so the app works again immediately.
// Stop the WhatsApp worker first, or it will sync chats straight back in.
//
//   npm run db:reset -- --yes

import fs from "node:fs";
import path from "node:path";
import { prisma } from "../lib/db";

async function main() {
  if (!process.argv.includes("--yes")) {
    console.error("This deletes all data and unlinks WhatsApp. Re-run with --yes to confirm.");
    process.exitCode = 1;
    return;
  }

  const tables = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      AND table_name <> '_prisma_migrations'`;

  if (tables.length > 0) {
    const list = tables.map((t) => `"public"."${t.table_name}"`).join(", ");
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  }
  console.log(`Cleared ${tables.length} tables.`);

  const authDir = path.resolve(process.env.WHATSAPP_AUTH_DIR ?? ".data/baileys-auth");
  if (fs.existsSync(authDir)) {
    fs.rmSync(authDir, { recursive: true, force: true });
    console.log(`Deleted ${authDir}. Remove "SM Dashboard" from WhatsApp > Linked devices on your phone.`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
