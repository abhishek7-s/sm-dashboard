"use server";

import { prisma } from "@/lib/db";
import { whatsappSendPolicy } from "@/lib/queue/message-policy";
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

export async function createBroadcastJob(
  body: string,
  contactIds: string[],
  options?: { delaySeconds?: number; jitterSeconds?: number; scheduledFor?: string },
) {
  if (!body.trim()) {
    return { error: "Message body cannot be empty" };
  }
  if (contactIds.length === 0) {
    return { error: "Select at least one recipient" };
  }

  const account = await prisma.channelAccount.findFirst({
    where: { type: "WHATSAPP", status: "CONNECTED" },
    orderBy: { updatedAt: "desc" },
  });

  if (!account) {
    return { error: "No connected WhatsApp account found" };
  }

  const delaySeconds = options?.delaySeconds ?? whatsappSendPolicy.defaultDelaySeconds;
  const jitterSeconds = options?.jitterSeconds ?? whatsappSendPolicy.defaultJitterSeconds;
  const scheduledFor = options?.scheduledFor ? new Date(options.scheduledFor) : null;

  const job = await prisma.messageQueueJob.create({
    data: {
      channelAccountId: account.id,
      title: `Broadcast to ${contactIds.length} contact${contactIds.length !== 1 ? "s" : ""}`,
      body: body.trim(),
      status: "QUEUED",
      maxRecipients: contactIds.length,
      delaySeconds,
      jitterSeconds,
      scheduledFor,
      recipients: {
        create: contactIds.map((contactId, index) => ({
          contactId,
          position: index,
          status: "PENDING",
          nextAttemptAt: scheduledFor ?? new Date(),
        })),
      },
    },
  });

  revalidatePath("/");
  return { success: true, jobId: job.id };
}

export async function pauseBroadcastJob(jobId: string) {
  await prisma.messageQueueJob.update({
    where: { id: jobId },
    data: { status: "PAUSED", pausedAt: new Date() },
  });
  revalidatePath("/");
  return { success: true };
}

export async function resumeBroadcastJob(jobId: string) {
  await prisma.messageQueueJob.update({
    where: { id: jobId },
    data: { status: "QUEUED", pausedAt: null },
  });
  revalidatePath("/");
  return { success: true };
}

export async function cancelBroadcastJob(jobId: string) {
  await prisma.$transaction([
    prisma.messageQueueRecipient.updateMany({
      where: { queueJobId: jobId, status: "PENDING" },
      data: { status: "SKIPPED" },
    }),
    prisma.messageQueueJob.update({
      where: { id: jobId },
      data: { status: "CANCELLED", completedAt: new Date() },
    }),
  ]);
  revalidatePath("/");
  return { success: true };
}
