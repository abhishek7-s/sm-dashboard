export type ChannelType = "whatsapp" | "instagram";

export type ChannelProvider =
  | "baileys"
  | "evolution-api"
  | "meta-cloud-api"
  | "instagram-graph-api";

export type ChannelConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "syncing"
  | "error";

export type SendMessageInput = {
  channelAccountId: string;
  conversationExternalId: string;
  contactExternalId: string;
  body: string;
};

export type SendMessageResult = {
  externalMessageId: string;
  sentAt: Date;
  providerPayload?: unknown;
};

export type ChannelProviderClient = {
  provider: ChannelProvider;
  sendTextMessage(input: SendMessageInput): Promise<SendMessageResult>;
};
