import makeWASocket, {
  Browsers,
  DisconnectReason,
  getContentType,
  downloadMediaMessage,
  fetchLatestWaWebVersion,
  useMultiFileAuthState as createMultiFileAuthState,
  type WAMessage,
} from "baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";
import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/db.ts";
import {
  getHistoryBackfillSeeds,
  markWhatsAppChannelDisconnected,
  persistWhatsAppChat,
  persistWhatsAppContact,
  persistWhatsAppHistorySet,
  persistWhatsAppMessage,
  upsertWhatsAppChannelAccount,
} from "../lib/whatsapp/persistence.ts";
import {
  HEARTBEAT_INTERVAL_MS,
  clearLogoutRequest,
  recordWorkerHeartbeat,
  setWhatsAppSessionStatus,
} from "../lib/whatsapp/session-state.ts";

type WhatsAppSocket = ReturnType<typeof makeWASocket>;

const authDir = path.resolve(
  process.cwd(),
  process.env.WHATSAPP_AUTH_DIR ?? ".data/baileys-auth",
);
const historySyncLimits = {
  chats: Number(process.env.WHATSAPP_HISTORY_CHAT_LIMIT ?? 100),
  contacts: Number(process.env.WHATSAPP_HISTORY_CONTACT_LIMIT ?? 100),
  messages: Number(process.env.WHATSAPP_HISTORY_MESSAGE_LIMIT ?? 1000),
};
const historyBackfill = {
  enabled: process.env.WHATSAPP_HISTORY_BACKFILL_ENABLED !== "false",
  chatLimit: Number(process.env.WHATSAPP_HISTORY_BACKFILL_CHAT_LIMIT ?? 5),
  messageLimit: Math.min(
    Number(process.env.WHATSAPP_HISTORY_BACKFILL_MESSAGE_LIMIT ?? 50),
    50,
  ),
};

let activeSocket: WhatsAppSocket | undefined;
let reconnectAttempts = 0;
let reconnectTimer: NodeJS.Timeout | undefined;
let sendPollTimer: NodeJS.Timeout | undefined;
let heartbeatTimer: NodeJS.Timeout | undefined;
let shuttingDown = false;
let relinking = false;

const logger = pino({
  level: process.env.WHATSAPP_LOG_LEVEL ?? "info",
  transport:
    process.env.NODE_ENV === "production"
      ? undefined
      : {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
          },
        },
});

function getDisconnectStatusCode(error: unknown) {
  return (error as { output?: { statusCode?: number } } | undefined)?.output
    ?.statusCode;
}

function getReconnectDelayMs() {
  const baseDelayMs = 2_000;
  const maxDelayMs = 30_000;
  const delayMs = Math.min(baseDelayMs * 2 ** reconnectAttempts, maxDelayMs);
  reconnectAttempts += 1;
  return delayMs;
}

function scheduleReconnect() {
  if (shuttingDown || reconnectTimer) {
    return;
  }

  const delayMs = getReconnectDelayMs();
  logger.info({ delayMs }, "Scheduling WhatsApp reconnect");

  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined;
    void startWhatsAppWorker();
  }, delayMs);
}

async function requestHistoryBackfill(sock: WhatsAppSocket) {
  if (!historyBackfill.enabled) {
    return;
  }

  const seeds = await getHistoryBackfillSeeds(historyBackfill.chatLimit);

  if (seeds.length === 0) {
    logger.info(
      "No stored WhatsApp messages found for manual history backfill seeds",
    );
    return;
  }

  for (const seed of seeds) {
    try {
      const requestId = await sock.fetchMessageHistory(
        historyBackfill.messageLimit,
        seed.key,
        seed.messageTimestamp,
      );

      logger.info(
        {
          requestId,
          chat: seed.conversationExternalId,
          messageLimit: historyBackfill.messageLimit,
          seedMessage: seed.messageExternalId,
        },
        "Requested WhatsApp history backfill",
      );
    } catch (error) {
      logger.error(
        {
          error,
          chat: seed.conversationExternalId,
          seedMessage: seed.messageExternalId,
        },
        "Failed to request WhatsApp history backfill",
      );
    }
  }
}

function getMessageBody(message: WAMessage) {
  const content = message.message;
  if (!content) {
    return "";
  }

  const type = getContentType(content);
  if (!type) {
    return "";
  }

  const payload = content[type];

  if (type === "conversation") {
    return String(payload ?? "");
  }

  if (
    payload &&
    typeof payload === "object" &&
    "text" in payload &&
    typeof payload.text === "string"
  ) {
    return payload.text;
  }

  if (
    payload &&
    typeof payload === "object" &&
    "caption" in payload &&
    typeof payload.caption === "string"
  ) {
    return payload.caption;
  }

  return `[${type}]`;
}

function getMessageContact(message: WAMessage) {
  const remoteJid = message.key.remoteJid ?? "unknown";
  const participant = message.key.participant;
  const fromMe = Boolean(message.key.fromMe);

  return {
    remoteJid,
    participant,
    direction: fromMe ? "outbound" : "inbound",
  };
}

/** Builds the Baileys payload for a text message or an uploaded attachment. */
function buildOutgoingContent(
  body: string | null,
  mediaUrl: string | null,
  mediaMimeType: string | null,
): any {
  if (!mediaUrl) {
    return { text: body || "" };
  }

  const filepath = path.join(process.cwd(), "public", mediaUrl);
  const caption = body || undefined;
  const isDocument = mediaMimeType?.includes('pdf') || mediaMimeType?.includes('document') || mediaMimeType?.includes('msword') || mediaMimeType?.includes('spreadsheet') || mediaMimeType?.includes('csv');

  if (isDocument) {
    return {
      document: { url: filepath },
      mimetype: mediaMimeType,
      fileName: path.basename(mediaUrl),
      caption,
    };
  }
  if (mediaMimeType?.includes('video')) {
    return { video: { url: filepath }, caption };
  }
  if (mediaMimeType?.includes('audio')) {
    return { audio: { url: filepath }, ptt: true };
  }
  if (mediaMimeType?.includes('image')) {
    return { image: { url: filepath }, caption };
  }
  return {
    document: { url: filepath },
    mimetype: mediaMimeType ?? "application/octet-stream",
    fileName: path.basename(mediaUrl),
    caption,
  };
}

async function processPendingMessages(sock: WhatsAppSocket) {
  const pendingMessages = await prisma.message.findMany({
    where: { status: "PENDING", direction: "OUTBOUND" },
    include: { conversation: true },
    orderBy: { createdAt: "asc" },
    take: 10,
  });

  for (const msg of pendingMessages) {
    const jid = msg.conversation.externalId;
    if (!jid) {
      await prisma.message.update({
        where: { id: msg.id },
        data: { status: "FAILED", failureReason: "This chat has no WhatsApp address.", failedAt: new Date() },
      });
      continue;
    }
    try {
      const sentMsg = await sock.sendMessage(
        jid,
        buildOutgoingContent(msg.body, msg.mediaUrl, msg.mediaMimeType),
      );
      await prisma.message.update({
        where: { id: msg.id },
        data: {
          status: "SENT",
          externalId: `${jid}:${sentMsg?.key.id}`,
          sentAt: new Date(),
        },
      });
      logger.info({ messageId: msg.id, jid }, "Sent pending WhatsApp message");
    } catch (err) {
      logger.error({ error: err, messageId: msg.id }, "Failed to send pending WhatsApp message");
      await prisma.message.update({
        where: { id: msg.id },
        data: { status: "FAILED", failureReason: String(err), failedAt: new Date() },
      });
    }
  }
}

function isQuietHours(): boolean {
  const hour = new Date().getHours();
  return hour >= 22 || hour < 8;
}

function getJitteredDelay(delaySeconds: number, jitterSeconds: number): number {
  const jitter = (Math.random() * 2 - 1) * jitterSeconds;
  return Math.max(10, delaySeconds + jitter) * 1000;
}

let queueNextSendAt: number = 0;

async function processQueueJobs(sock: WhatsAppSocket) {
  // Don't send during quiet hours
  if (isQuietHours()) return;
  // Rate-limit: only process one recipient at a time
  if (Date.now() < queueNextSendAt) return;

  // Find the oldest active job
  const job = await prisma.messageQueueJob.findFirst({
    where: { status: { in: ["QUEUED", "RUNNING"] } },
    orderBy: { createdAt: "asc" },
    include: {
      recipients: {
        where: {
          status: "PENDING",
          nextAttemptAt: { lte: new Date() },
        },
        orderBy: { position: "asc" },
        take: 1,
        include: { contact: true },
      },
    },
  });

  if (!job) return;

  const recipient = job.recipients[0];
  if (!recipient) {
    // All recipients processed — mark job complete
    const remaining = await prisma.messageQueueRecipient.count({
      where: { queueJobId: job.id, status: { in: ["PENDING", "SENDING"] } },
    });
    if (remaining === 0) {
      await prisma.messageQueueJob.update({
        where: { id: job.id },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
      logger.info({ jobId: job.id }, "Broadcast job completed");
    }
    return;
  }

  // Mark job as running
  if (job.status === "QUEUED") {
    await prisma.messageQueueJob.update({
      where: { id: job.id },
      data: { status: "RUNNING", startedAt: new Date() },
    });
  }

  // Mark recipient as sending
  await prisma.messageQueueRecipient.update({
    where: { id: recipient.id },
    data: { status: "SENDING", attempts: { increment: 1 } },
  });

  // Find the conversation for this contact
  const conversation = await prisma.conversation.findFirst({
    where: {
      channelAccountId: job.channelAccountId,
      participants: { some: { contactId: recipient.contactId } },
      type: "DIRECT",
    },
  });

  const jid = conversation?.externalId ?? recipient.contact.externalId;

  try {
    const sentMsg = await sock.sendMessage(
      jid,
      buildOutgoingContent(job.body, job.mediaUrl, job.mediaMimeType),
    );
    const now = new Date();
    await prisma.messageQueueRecipient.update({
      where: { id: recipient.id },
      data: { status: "SENT", sentAt: now },
    });

    // Persist the message in the conversation so it shows in the chat
    if (conversation && sentMsg?.key.id) {
      const scopedExternalId = `${jid}:${sentMsg.key.id}`;
      await prisma.message.upsert({
        where: {
          channelAccountId_externalId: {
            channelAccountId: job.channelAccountId,
            externalId: scopedExternalId,
          },
        },
        create: {
          channelAccountId: job.channelAccountId,
          conversationId: conversation.id,
          contactId: recipient.contactId,
          externalId: scopedExternalId,
          direction: "OUTBOUND",
          kind: "TEXT",
          status: "SENT",
          body: job.body,
          sentAt: now,
        },
        update: { status: "SENT", sentAt: now },
      });
    }

    logger.info(
      { jobId: job.id, recipientId: recipient.id, jid },
      "Sent queued broadcast message",
    );

  } catch (err) {
    const attempts = recipient.attempts + 1;
    const maxAttempts = 3;
    if (attempts >= maxAttempts) {
      await prisma.messageQueueRecipient.update({
        where: { id: recipient.id },
        data: {
          status: "FAILED",
          failureReason: String(err),
        },
      });
      logger.error({ error: err, jobId: job.id, recipientId: recipient.id }, "Broadcast recipient permanently failed");
    } else {
      const retryDelay = getJitteredDelay(job.delaySeconds, job.jitterSeconds);
      await prisma.messageQueueRecipient.update({
        where: { id: recipient.id },
        data: {
          status: "PENDING",
          nextAttemptAt: new Date(Date.now() + retryDelay),
        },
      });
      logger.warn({ error: err, jobId: job.id, attempt: attempts }, "Broadcast recipient failed, will retry");
    }
  }

  // Schedule next send time
  queueNextSendAt = Date.now() + getJitteredDelay(job.delaySeconds, job.jitterSeconds);
}

/** Wipes the stored WhatsApp login and starts over so a fresh QR code is shown. */
async function resetAuthAndRelink() {
  if (relinking || shuttingDown) {
    return;
  }
  relinking = true;
  try {
    if (sendPollTimer) clearInterval(sendPollTimer);
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
    }
    await setWhatsAppSessionStatus("LOGGED_OUT", { qr: null });
    await fs.rm(authDir, { recursive: true, force: true });
    await clearLogoutRequest();
    reconnectAttempts = 0;
    logger.info("WhatsApp auth cleared; starting a new link session");
    await startWhatsAppWorker();
  } finally {
    relinking = false;
  }
}

/** Lets the dashboard see the worker is alive, and picks up "unlink" requests. */
function startHeartbeat() {
  const beat = async () => {
    try {
      const logoutRequested = await recordWorkerHeartbeat();
      if (logoutRequested && !relinking) {
        logger.info("Dashboard requested WhatsApp unlink");
        try {
          // Triggers connection.update(close, loggedOut), which relinks.
          await activeSocket?.logout();
        } catch {
          await resetAuthAndRelink();
        }
        await clearLogoutRequest();
      }
    } catch (error) {
      logger.error({ error }, "Failed to record worker heartbeat");
    }
  };

  void beat();
  heartbeatTimer = setInterval(beat, HEARTBEAT_INTERVAL_MS);
}

async function startWhatsAppWorker() {
  const { state, saveCreds } = await createMultiFileAuthState(authDir);
  // WhatsApp rejects linking (405) when Baileys' bundled web version goes stale.
  const { version, isLatest } = await fetchLatestWaWebVersion({});
  logger.info({ version, isLatest }, "Using WhatsApp Web version");

  const sock = makeWASocket({
    version,
    auth: state,
    browser: Browsers.macOS("SM Dashboard"),
    logger,
    markOnlineOnConnect: false,
    syncFullHistory: true,
  });

  activeSocket = sock;
  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      logger.info("Scan this QR code with WhatsApp > Linked devices (also shown in the dashboard).");
      qrcode.generate(qr, { small: true });
      await setWhatsAppSessionStatus("QR_READY", { qr });
    }

    if (connection === "open") {
      reconnectAttempts = 0;
      await setWhatsAppSessionStatus("CONNECTED", { qr: null, lastError: null });
      await upsertWhatsAppChannelAccount(sock.user);
      void requestHistoryBackfill(sock);

      if (sendPollTimer) clearInterval(sendPollTimer);
      sendPollTimer = setInterval(async () => {
        try {
          await processPendingMessages(sock);
          await processQueueJobs(sock);
        } catch (err) {
          logger.error({ error: err }, "Error in send poller");
        }
      }, 1000);

      logger.info(
        {
          authDir,
          user: sock.user?.id,
          name: sock.user?.name,
        },
        "WhatsApp connection opened",
      );
      return;
    }

    if (connection === "close") {
      const statusCode = getDisconnectStatusCode(lastDisconnect?.error);
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      logger.warn(
        {
          statusCode,
          shouldReconnect,
          error: lastDisconnect?.error,
        },
        "WhatsApp connection closed",
      );

      if (shouldReconnect) {
        await markWhatsAppChannelDisconnected();
        if (sendPollTimer) clearInterval(sendPollTimer);
        if (!shuttingDown) {
          await setWhatsAppSessionStatus("RECONNECTING", {
            lastError: lastDisconnect?.error?.message ?? null,
          });
        }
        scheduleReconnect();
      } else {
        await markWhatsAppChannelDisconnected();
        logger.warn("WhatsApp logged out; clearing auth so it can be relinked");
        await resetAuthAndRelink();
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    for (const message of messages) {
      const { remoteJid, participant, direction } = getMessageContact(message);
      const body = getMessageBody(message);

      let mediaUrl: string | undefined;
      let mediaMimeType: string | undefined;

      try {
        const messageType = getContentType(message.message);
        const isMedia = messageType === "imageMessage" || messageType === "videoMessage" || messageType === "audioMessage" || messageType === "documentMessage" || messageType === "stickerMessage";

        if (isMedia && message.message) {
          const buffer = await downloadMediaMessage(
            message,
            "buffer",
            {},
            { 
              logger,
              reuploadRequest: sock.updateMediaMessage
            }
          );
          
          const mediaMessage = message.message[messageType as keyof typeof message.message] as any;
          mediaMimeType = mediaMessage?.mimetype;
          
          let ext = "";
          if (mediaMimeType) {
            ext = "." + mediaMimeType.split("/")[1].split(";")[0];
          } else if (messageType === 'stickerMessage') {
            ext = '.webp';
          } else if (messageType === 'imageMessage') {
            ext = '.jpeg';
          }

          const filename = `${randomUUID()}${ext}`;
          const uploadDir = path.join(process.cwd(), "public", "uploads", "whatsapp");
          await fs.mkdir(uploadDir, { recursive: true });
          
          const filepath = path.join(uploadDir, filename);
          await fs.writeFile(filepath, buffer);
          
          mediaUrl = `/uploads/whatsapp/${filename}`;
        }
      } catch (err) {
        logger.error({ err, messageId: message.key.id }, "Failed to download media");
      }

      logger.info(
        {
          type,
          direction,
          remoteJid,
          participant,
          messageId: message.key.id,
          timestamp: message.messageTimestamp,
          body,
          mediaUrl,
        },
        "WhatsApp message received",
      );

      try {
        await persistWhatsAppMessage({ message, upsertType: type, mediaUrl, mediaMimeType });
      } catch (error) {
        logger.error(
          {
            error,
            remoteJid,
            messageId: message.key.id,
          },
          "Failed to persist WhatsApp message",
        );
      }
    }
  });

  sock.ev.on("messaging-history.set", async (history) => {
    const sortedChats = [...history.chats].sort((a, b) => 
      (Number(b.conversationTimestamp) || 0) - (Number(a.conversationTimestamp) || 0)
    );
    const chats = sortedChats.slice(0, historySyncLimits.chats);
    
    const contacts = history.contacts.slice(0, historySyncLimits.contacts);
    
    const sortedMessages = [...history.messages].sort((a, b) =>
      (Number(b.messageTimestamp) || 0) - (Number(a.messageTimestamp) || 0)
    );
    const messages = sortedMessages.slice(0, historySyncLimits.messages);

    logger.info(
      {
        received: {
          chats: history.chats.length,
          contacts: history.contacts.length,
          messages: history.messages.length,
        },
        persistedLimit: historySyncLimits,
        progress: history.progress,
        syncType: history.syncType,
      },
      "WhatsApp history sync chunk received",
    );

    try {
      const persisted = await persistWhatsAppHistorySet({
        chats,
        contacts,
        messages,
        progress: history.progress,
        syncType: history.syncType,
      });

      logger.info({ persisted }, "WhatsApp history sync chunk persisted");
    } catch (error) {
      logger.error({ error }, "Failed to persist WhatsApp history sync chunk");
    }
  });

  sock.ev.on("messaging-history.status", (status) => {
    logger.info(status, "WhatsApp history sync status");
  });

  sock.ev.on("chats.upsert", async (chats) => {
    for (const chat of chats.slice(0, historySyncLimits.chats)) {
      try {
        await persistWhatsAppChat(chat);
      } catch (error) {
        logger.error({ error, chatId: chat.id }, "Failed to persist WhatsApp chat");
      }
    }
  });

  sock.ev.on("contacts.upsert", async (contacts) => {
    for (const contact of contacts.slice(0, historySyncLimits.contacts)) {
      try {
        await persistWhatsAppContact(contact);
      } catch (error) {
        logger.error(
          { error, contactId: contact.id },
          "Failed to persist WhatsApp contact",
        );
      }
    }
  });

  sock.ev.on("contacts.update", async (contacts) => {
    for (const contact of contacts.slice(0, historySyncLimits.contacts)) {
      try {
        await persistWhatsAppContact(contact);
      } catch (error) {
        logger.error(
          { error, contactId: contact.id },
          "Failed to persist WhatsApp contact update",
        );
      }
    }
  });
}

async function stopWhatsAppWorker() {
  shuttingDown = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
  }
  if (sendPollTimer) {
    clearInterval(sendPollTimer);
  }
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
  }

  logger.info("Stopping WhatsApp worker");
  await activeSocket?.end(undefined);
  await setWhatsAppSessionStatus("STOPPED", { qr: null }).catch(() => {});
  process.exit(0);
}

process.once("SIGINT", () => void stopWhatsAppWorker());
process.once("SIGTERM", () => void stopWhatsAppWorker());

startHeartbeat();
setWhatsAppSessionStatus("STARTING", { qr: null })
  .then(() => startWhatsAppWorker())
  .catch((error) => {
    logger.fatal({ error }, "WhatsApp worker crashed");
    process.exit(1);
  });
