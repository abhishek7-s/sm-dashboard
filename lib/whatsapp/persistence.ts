import {
  ChannelAccountStatus,
  ChannelProvider,
  ChannelType,
  ConversationType,
  MessageDirection,
  MessageKind,
  MessageStatus,
  type Prisma,
  type Message,
} from "@prisma/client";
import {
  getContentType,
  type Chat,
  type Contact as BaileysContact,
  type WAMessage,
  type WASocket,
} from "baileys";
import { prisma } from "../db.ts";

const providerInstanceId =
  process.env.WHATSAPP_PROVIDER_INSTANCE_ID ?? "primary-whatsapp";
const authStateLocation =
  process.env.WHATSAPP_AUTH_DIR ?? ".data/baileys-auth";

type PersistMessageInput = {
  message: WAMessage;
  upsertType: string;
};

type PersistHistoryInput = {
  chats: Chat[];
  contacts: BaileysContact[];
  messages: WAMessage[];
  syncType?: unknown;
  progress?: number | null;
};

export type HistoryBackfillSeed = {
  conversationExternalId: string;
  messageExternalId: string;
  key: NonNullable<WAMessage["key"]>;
  messageTimestamp: NonNullable<WAMessage["messageTimestamp"]>;
};

function getPhoneFromJid(jid: string) {
  const [user] = jid.split("@");
  return user?.replace(/\D/g, "") || null;
}

function isGroupJid(jid: string) {
  return jid.endsWith("@g.us");
}

function getContactDisplayName(contact: Partial<BaileysContact>) {
  return (
    contact.name ??
    contact.notify ??
    contact.verifiedName ??
    contact.phoneNumber ??
    contact.id ??
    "Unknown"
  );
}

function toDate(timestamp: WAMessage["messageTimestamp"]) {
  if (!timestamp) {
    return new Date();
  }

  const rawValue =
    typeof timestamp === "number" ? timestamp : Number(timestamp.toString());

  return new Date(rawValue * 1000);
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(value, (_key, nestedValue) => {
      if (typeof nestedValue === "bigint") {
        return nestedValue.toString();
      }

      if (Buffer.isBuffer(nestedValue)) {
        return nestedValue.toString("base64");
      }

      if (nestedValue instanceof Uint8Array) {
        return Buffer.from(nestedValue).toString("base64");
      }

      return nestedValue;
    }),
  ) as Prisma.InputJsonValue;
}

function isUniqueConstraintError(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return false;
  }

  return (error as { code?: unknown }).code === "P2002";
}

function getContentKind(message: WAMessage) {
  const type = message.message ? getContentType(message.message) : undefined;

  switch (type) {
    case "conversation":
    case "extendedTextMessage":
      return MessageKind.TEXT;
    case "imageMessage":
      return MessageKind.IMAGE;
    case "videoMessage":
      return MessageKind.VIDEO;
    case "audioMessage":
      return MessageKind.AUDIO;
    case "documentMessage":
      return MessageKind.DOCUMENT;
    case "stickerMessage":
      return MessageKind.STICKER;
    case "locationMessage":
    case "liveLocationMessage":
      return MessageKind.LOCATION;
    case "contactMessage":
    case "contactsArrayMessage":
      return MessageKind.CONTACT;
    case "protocolMessage":
      return MessageKind.SYSTEM;
    default:
      return MessageKind.UNKNOWN;
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

export async function upsertWhatsAppChannelAccount(user?: WASocket["user"]) {
  const externalAccountId = user?.id ?? null;
  const phoneNumber = externalAccountId
    ? getPhoneFromJid(externalAccountId)
    : null;
  const displayName = user?.name ?? phoneNumber ?? "WhatsApp";
  const userMetadata = user ? toJson(user) : undefined;

  return prisma.channelAccount.upsert({
    where: {
      provider_providerInstanceId: {
        provider: ChannelProvider.BAILEYS,
        providerInstanceId,
      },
    },
    create: {
      type: ChannelType.WHATSAPP,
      provider: ChannelProvider.BAILEYS,
      providerInstanceId,
      externalAccountId,
      phoneNumber,
      displayName,
      authStateLocation,
      status: ChannelAccountStatus.CONNECTED,
      lastConnectedAt: new Date(),
      metadata: user ? toJson(user) : undefined,
    },
    update: {
      ...(user
        ? {
            externalAccountId,
            phoneNumber,
            displayName,
            metadata: userMetadata,
          }
        : {}),
      authStateLocation,
      status: ChannelAccountStatus.CONNECTED,
      lastConnectedAt: new Date(),
    },
  });
}

export async function markWhatsAppChannelDisconnected() {
  await prisma.channelAccount.updateMany({
    where: {
      provider: ChannelProvider.BAILEYS,
      providerInstanceId,
    },
    data: {
      status: ChannelAccountStatus.DISCONNECTED,
    },
  });
}

export async function persistWhatsAppContact(contact: Partial<BaileysContact>) {
  if (!contact.id) {
    return null;
  }

  const channelAccount = await upsertWhatsAppChannelAccount();
  const phoneNumber = contact.phoneNumber ?? getPhoneFromJid(contact.id);

  return prisma.contact.upsert({
    where: {
      channelAccountId_externalId: {
        channelAccountId: channelAccount.id,
        externalId: contact.id,
      },
    },
    create: {
      channelAccountId: channelAccount.id,
      externalId: contact.id,
      phoneNumber,
      username: contact.username,
      displayName: getContactDisplayName(contact),
      avatarUrl:
        contact.imgUrl && contact.imgUrl !== "changed" ? contact.imgUrl : null,
      isGroup: isGroupJid(contact.id),
      metadata: toJson(contact),
    },
    update: {
      phoneNumber,
      username: contact.username,
      displayName: getContactDisplayName(contact),
      avatarUrl:
        contact.imgUrl && contact.imgUrl !== "changed" ? contact.imgUrl : null,
      isGroup: isGroupJid(contact.id),
      metadata: toJson(contact),
    },
  });
}

export async function persistWhatsAppChat(chat: Chat) {
  if (!chat.id) {
    return null;
  }

  const channelAccount = await upsertWhatsAppChannelAccount();
  const group = isGroupJid(chat.id);
  const title =
    chat.name ?? getPhoneFromJid(chat.id) ?? (group ? "WhatsApp group" : chat.id);

  return prisma.conversation.upsert({
    where: {
      channelAccountId_externalId: {
        channelAccountId: channelAccount.id,
        externalId: chat.id,
      },
    },
    create: {
      channelAccountId: channelAccount.id,
      externalId: chat.id,
      type: group ? ConversationType.GROUP : ConversationType.DIRECT,
      title,
      lastMessageAt: chat.conversationTimestamp
        ? toDate(chat.conversationTimestamp)
        : undefined,
      unreadCount: Number(chat.unreadCount ?? 0),
      metadata: toJson(chat),
    },
    update: {
      title,
      lastMessageAt: chat.conversationTimestamp
        ? toDate(chat.conversationTimestamp)
        : undefined,
      unreadCount:
        typeof chat.unreadCount === "number" ? Number(chat.unreadCount) : undefined,
      metadata: toJson(chat),
    },
  });
}

export async function persistWhatsAppHistorySet({
  chats,
  contacts,
  messages,
  progress,
  syncType,
}: PersistHistoryInput) {
  const persistedContacts = await Promise.all(
    contacts.map((contact) => persistWhatsAppContact(contact)),
  );
  const persistedChats = await Promise.all(
    chats.map((chat) => persistWhatsAppChat(chat)),
  );
  const persistedMessages = await Promise.all(
    messages.map((message) =>
      persistWhatsAppMessage({ message, upsertType: "append" }),
    ),
  );

  await prisma.channelAccount.updateMany({
    where: {
      provider: ChannelProvider.BAILEYS,
      providerInstanceId,
    },
    data: {
      lastSyncAt: new Date(),
      metadata: toJson({
        lastHistorySync: {
          syncType,
          progress,
          chats: chats.length,
          contacts: contacts.length,
          messages: messages.length,
        },
      }),
    },
  });

  return {
    chats: persistedChats.filter(Boolean).length,
    contacts: persistedContacts.filter(Boolean).length,
    messages: persistedMessages.filter(Boolean).length,
  };
}

function isWAMessagePayload(value: unknown): value is WAMessage {
  return Boolean(
    value &&
      typeof value === "object" &&
      "key" in value &&
      (value as { key?: unknown }).key,
  );
}

function toHistoryBackfillSeed(
  message: Pick<Message, "externalId" | "rawPayload">,
): HistoryBackfillSeed | null {
  const payload = message.rawPayload;

  if (!isWAMessagePayload(payload) || !payload.key || !payload.messageTimestamp) {
    return null;
  }

  return {
    conversationExternalId: payload.key.remoteJid ?? "",
    messageExternalId: message.externalId,
    key: payload.key,
    messageTimestamp: payload.messageTimestamp,
  } satisfies HistoryBackfillSeed;
}

export async function getHistoryBackfillSeeds(
  limit = 5,
): Promise<HistoryBackfillSeed[]> {
  const channelAccount = await prisma.channelAccount.findFirst({
    where: {
      provider: ChannelProvider.BAILEYS,
      providerInstanceId,
    },
    select: {
      conversations: {
        orderBy: {
          lastMessageAt: "desc",
        },
        take: limit,
        select: {
          externalId: true,
          messages: {
            orderBy: {
              sentAt: "asc",
            },
            take: 1,
            select: {
              externalId: true,
              rawPayload: true,
            },
          },
        },
      },
    },
  });

  return (
    channelAccount?.conversations
      .map((conversation) => {
        const [message] = conversation.messages;
        if (!message) {
          return null;
        }

        const seed = toHistoryBackfillSeed(message);
        if (!seed) {
          return null;
        }

        return {
          ...seed,
          conversationExternalId: conversation.externalId,
        };
      })
      .filter((seed): seed is HistoryBackfillSeed => Boolean(seed)) ?? []
  );
}

export async function persistWhatsAppMessage({
  message,
  upsertType,
}: PersistMessageInput) {
  const remoteJid = message.key.remoteJid;
  const externalMessageId = message.key.id;

  if (!remoteJid || !externalMessageId || remoteJid === "status@broadcast") {
    return null;
  }

  const channelAccount = await upsertWhatsAppChannelAccount();
  const scopedExternalMessageId = `${remoteJid}:${externalMessageId}`;
  const existingMessage = await prisma.message.findUnique({
    where: {
      channelAccountId_externalId: {
        channelAccountId: channelAccount.id,
        externalId: scopedExternalMessageId,
      },
    },
    select: {
      id: true,
    },
  });
  const sentAt = toDate(message.messageTimestamp);
  const group = isGroupJid(remoteJid);
  const contactJid = group ? message.key.participant : remoteJid;
  const fromMe = Boolean(message.key.fromMe);
  const shouldIncrementUnread =
    !existingMessage && !fromMe && upsertType === "notify";
  const body = getMessageBody(message);
  const displayName =
    message.pushName ??
    getPhoneFromJid(contactJid ?? remoteJid) ??
    contactJid ??
    remoteJid;

  const contact = contactJid
    ? await prisma.contact.upsert({
        where: {
          channelAccountId_externalId: {
            channelAccountId: channelAccount.id,
            externalId: contactJid,
          },
        },
        create: {
          channelAccountId: channelAccount.id,
          externalId: contactJid,
          phoneNumber: getPhoneFromJid(contactJid),
          displayName,
          isGroup: false,
          metadata: toJson({
            participant: message.key.participant,
            pushName: message.pushName,
          }),
        },
        update: {
          displayName,
          phoneNumber: getPhoneFromJid(contactJid),
          metadata: toJson({
            participant: message.key.participant,
            pushName: message.pushName,
          }),
        },
      })
    : null;

  const conversation = await prisma.conversation.upsert({
    where: {
      channelAccountId_externalId: {
        channelAccountId: channelAccount.id,
        externalId: remoteJid,
      },
    },
    create: {
      channelAccountId: channelAccount.id,
      externalId: remoteJid,
      type: group ? ConversationType.GROUP : ConversationType.DIRECT,
      title: group ? remoteJid : displayName,
      lastMessageAt: sentAt,
      unreadCount: shouldIncrementUnread ? 1 : 0,
      metadata: toJson({ remoteJid }),
    },
    update: {
      title: group ? remoteJid : displayName,
      lastMessageAt: sentAt,
      unreadCount: shouldIncrementUnread
        ? {
            increment: 1,
          }
        : undefined,
      metadata: toJson({ remoteJid }),
    },
  });

  if (contact) {
    try {
      await prisma.conversationContact.create({
        data: {
          conversationId: conversation.id,
          contactId: contact.id,
        },
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }
    }
  }

  return prisma.message.upsert({
    where: {
      channelAccountId_externalId: {
        channelAccountId: channelAccount.id,
        externalId: scopedExternalMessageId,
      },
    },
    create: {
      channelAccountId: channelAccount.id,
      conversationId: conversation.id,
      contactId: contact?.id,
      externalId: scopedExternalMessageId,
      direction: fromMe ? MessageDirection.OUTBOUND : MessageDirection.INBOUND,
      kind: getContentKind(message),
      status: fromMe ? MessageStatus.SENT : MessageStatus.DELIVERED,
      body,
      sentAt,
      rawPayload: toJson(message),
    },
    update: {
      conversationId: conversation.id,
      contactId: contact?.id,
      direction: fromMe ? MessageDirection.OUTBOUND : MessageDirection.INBOUND,
      kind: getContentKind(message),
      status: fromMe ? MessageStatus.SENT : MessageStatus.DELIVERED,
      body,
      sentAt,
      rawPayload: toJson(message),
    },
  });
}
