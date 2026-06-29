import type {
  ChannelProviderClient,
  SendMessageInput,
  SendMessageResult,
} from "@/lib/channels/types";

export type EvolutionClientConfig = {
  baseUrl: string;
  apiKey: string;
  instanceName: string;
};

export function createEvolutionClient(
  config: EvolutionClientConfig,
): ChannelProviderClient {
  return {
    provider: "evolution-api",
    async sendTextMessage(input: SendMessageInput): Promise<SendMessageResult> {
      const response = await fetch(
        `${config.baseUrl.replace(/\/$/, "")}/message/sendText/${config.instanceName}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: config.apiKey,
          },
          body: JSON.stringify({
            number: input.contactExternalId,
            text: input.body,
          }),
        },
      );

      if (!response.ok) {
        const details = await response.text();
        throw new Error(`Evolution API send failed: ${response.status} ${details}`);
      }

      const providerPayload = (await response.json()) as {
        key?: { id?: string };
        messageTimestamp?: number;
      };

      return {
        externalMessageId: providerPayload.key?.id ?? crypto.randomUUID(),
        sentAt: providerPayload.messageTimestamp
          ? new Date(providerPayload.messageTimestamp * 1000)
          : new Date(),
        providerPayload,
      };
    },
  };
}
