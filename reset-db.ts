import { prisma } from "./lib/db";
import fs from "fs";
import path from "path";

async function main() {
  console.log("Clearing DB...");
  await prisma.message.deleteMany();
  await prisma.conversationContact.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.messageQueueRecipient.deleteMany();
  await prisma.messageQueueJob.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.channelAccount.deleteMany();
  console.log("DB Cleared.");

  const authDir = path.join(process.cwd(), ".data/baileys-auth");
  if (fs.existsSync(authDir)) {
    fs.rmSync(authDir, { recursive: true, force: true });
    console.log("Deleted .data/baileys-auth");
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
