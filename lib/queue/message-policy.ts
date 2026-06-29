export const whatsappSendPolicy = {
  maxRecipientsPerSelection: 5,
  defaultDelaySeconds: 45,
  defaultJitterSeconds: 15,
  maxAttemptsPerRecipient: 3,
  quietHours: {
    startHour: 22,
    endHour: 8,
  },
} as const;

export type WhatsappSendPolicy = typeof whatsappSendPolicy;
