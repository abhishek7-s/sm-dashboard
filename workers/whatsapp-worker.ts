import makeWASocket, {
  Browsers,
  DisconnectReason,
  getContentType,
  useMultiFileAuthState as createMultiFileAuthState,
  type WAMessage,
} from "baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";
import path from "node:path";
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
let shuttingDown = false;

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

async function startWhatsAppWorker() {
  const { state, saveCreds } = await createMultiFileAuthState(authDir);

  const sock = makeWASocket({
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
      logger.info("Scan this QR code with WhatsApp > Linked devices.");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      reconnectAttempts = 0;
      await upsertWhatsAppChannelAccount(sock.user);
      void requestHistoryBackfill(sock);

      if (sendPollTimer) clearInterval(sendPollTimer);
      sendPollTimer = setInterval(async () => {
        try {
          const pendingMessages = await prisma.message.findMany({
            where: {
              status: "PENDING",
              direction: "OUTBOUND",
            },
            include: { conversation: true },
            take: 10,
          });

          for (const msg of pendingMessages) {
            const jid = msg.conversation.externalId;
            if (!jid) continue;

            try {
              const sentMsg = await sock.sendMessage(jid, { text: msg.body || "" });
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
                data: {
                  status: "FAILED",
                  failureReason: String(err),
                  failedAt: new Date(),
                },
              });
            }
          }
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
        scheduleReconnect();
      } else {
        await markWhatsAppChannelDisconnected();
        if (sendPollTimer) clearInterval(sendPollTimer);
        logger.error(
          `WhatsApp logged out. Delete ${authDir} and run the worker again to relink.`,
        );
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    for (const message of messages) {
      const { remoteJid, participant, direction } = getMessageContact(message);
      const body = getMessageBody(message);

      logger.info(
        {
          type,
          direction,
          remoteJid,
          participant,
          messageId: message.key.id,
          timestamp: message.messageTimestamp,
          body,
        },
        "WhatsApp message received",
      );

      try {
        await persistWhatsAppMessage({ message, upsertType: type });
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

  logger.info("Stopping WhatsApp worker");
  await activeSocket?.end(undefined);
  process.exit(0);
}

process.once("SIGINT", () => void stopWhatsAppWorker());
process.once("SIGTERM", () => void stopWhatsAppWorker());

startWhatsAppWorker().catch((error) => {
  logger.fatal({ error }, "WhatsApp worker crashed");
  process.exit(1);
});
