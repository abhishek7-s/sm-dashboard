"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { v4 as uuidv4 } from "uuid";

export async function sendChatMessage(conversationId: string, body: string) {
  if (!body.trim()) {
    return { error: "Message cannot be empty" };
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { participants: true },
  });

  if (!conversation) {
    return { error: "Conversation not found" };
  }

  const contactId = conversation.participants[0]?.contactId;

  await prisma.message.create({
    data: {
      channelAccountId: conversation.channelAccountId,
      conversationId: conversation.id,
      contactId: contactId,
      externalId: `pending-${uuidv4()}`,
      direction: "OUTBOUND",
      kind: "TEXT",
      status: "PENDING",
      body: body.trim(),
    },
  });

  revalidatePath("/");
  return { success: true };
}
