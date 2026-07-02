import { z } from "zod";

export type ChatAnalysisMessage = {
  direction: "INBOUND" | "OUTBOUND";
  body: string;
  sentAt: Date | null;
};

export type ChatAnalysisResult = {
  provider: "groq" | "openrouter" | "local";
  model: string;
  personMood: string;
  moodScore: number;
  conversationDirection: string;
  confidence: number;
  summary: string;
  decidedOn: string;
  recommendedReplyTone: string;
  evidence: string[];
  nextBestAction: string;
};

const analysisSchema = z.object({
  personMood: z.string().min(1),
  moodScore: z.number().min(-100).max(100),
  conversationDirection: z.string().min(1),
  confidence: z.number().min(0).max(100),
  summary: z.string().min(1),
  decidedOn: z.string().min(1),
  recommendedReplyTone: z.string().min(1),
  evidence: z.array(z.string()).min(1).max(5),
  nextBestAction: z.string().min(1),
});

type ProviderConfig = {
  provider: "groq" | "openrouter";
  endpoint: string;
  apiKey: string;
  model: string;
  headers?: Record<string, string>;
};

const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";
const DEFAULT_OPENROUTER_MODEL = "meta-llama/llama-3.3-70b-instruct:free";

function getProviderConfig(): ProviderConfig | null {
  const preferredProvider = process.env.CHAT_ANALYSIS_PROVIDER?.toLowerCase();

  if (preferredProvider === "openrouter" && process.env.OPENROUTER_API_KEY) {
    return {
      provider: "openrouter",
      endpoint: "https://openrouter.ai/api/v1/chat/completions",
      apiKey: process.env.OPENROUTER_API_KEY,
      model: process.env.OPENROUTER_MODEL ?? DEFAULT_OPENROUTER_MODEL,
      headers: {
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "http://localhost:3000",
        "X-OpenRouter-Title": process.env.OPENROUTER_SITE_NAME ?? "SM Dashboard",
      },
    };
  }

  if (process.env.GROQ_API_KEY) {
    return {
      provider: "groq",
      endpoint: "https://api.groq.com/openai/v1/chat/completions",
      apiKey: process.env.GROQ_API_KEY,
      model: process.env.GROQ_MODEL ?? DEFAULT_GROQ_MODEL,
    };
  }

  if (process.env.OPENROUTER_API_KEY) {
    return {
      provider: "openrouter",
      endpoint: "https://openrouter.ai/api/v1/chat/completions",
      apiKey: process.env.OPENROUTER_API_KEY,
      model: process.env.OPENROUTER_MODEL ?? DEFAULT_OPENROUTER_MODEL,
      headers: {
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "http://localhost:3000",
        "X-OpenRouter-Title": process.env.OPENROUTER_SITE_NAME ?? "SM Dashboard",
      },
    };
  }

  return null;
}

function formatTranscript(messages: ChatAnalysisMessage[]) {
  return messages
    .map((message, index) => {
      const speaker = message.direction === "INBOUND" ? "Customer/person" : "Dashboard/user";
      const timestamp = message.sentAt?.toISOString() ?? "unknown time";
      return `${index + 1}. [${timestamp}] ${speaker}: ${message.body}`;
    })
    .join("\n");
}

function extractJson(content: string) {
  const fencedMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1] ?? content;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error("AI response did not contain JSON.");
  }

  return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
}

function localFallback(messages: ChatAnalysisMessage[]): ChatAnalysisResult {
  const inbound = messages.filter((message) => message.direction === "INBOUND");
  const inboundText = inbound.map((message) => message.body.toLowerCase()).join(" ");
  const positiveWords = ["thanks", "thank", "great", "good", "ok", "okay", "yes", "sure", "happy", "love", "perfect", "nice"];
  const negativeWords = ["angry", "bad", "issue", "problem", "wrong", "delay", "late", "refund", "cancel", "not", "never", "why"];
  const positive = positiveWords.reduce((count, word) => count + (inboundText.includes(word) ? 1 : 0), 0);
  const negative = negativeWords.reduce((count, word) => count + (inboundText.includes(word) ? 1 : 0), 0);
  const moodScore = Math.max(-100, Math.min(100, (positive - negative) * 18));
  const personMood = moodScore > 20 ? "positive" : moodScore < -20 ? "concerned" : "neutral";
  const recentInbound = inbound.slice(-3).map((message) => message.body);

  return {
    provider: "local",
    model: "keyword-fallback",
    personMood,
    moodScore,
    conversationDirection: negative > positive ? "Needs attention" : "Stable",
    confidence: 45,
    summary: "Local keyword analysis was used because no AI API key is configured.",
    decidedOn: "Based on the recent inbound message wording and simple positive/negative keyword balance.",
    recommendedReplyTone: negative > positive ? "Calm, specific, and reassuring" : "Friendly and concise",
    evidence: recentInbound.length > 0 ? recentInbound : ["No inbound text messages were available to evaluate."],
    nextBestAction: negative > positive ? "Acknowledge the concern and ask one clarifying question." : "Continue the conversation normally.",
  };
}

export async function analyzeChatMessages(messages: ChatAnalysisMessage[]): Promise<ChatAnalysisResult> {
  const textMessages = messages
    .filter((message) => message.body.trim().length > 0)
    .slice(-80);

  if (textMessages.length === 0) {
    return {
      provider: "local",
      model: "empty-chat",
      personMood: "unknown",
      moodScore: 0,
      conversationDirection: "Not enough data",
      confidence: 0,
      summary: "There are no text messages to analyze in this chat yet.",
      decidedOn: "No text messages were available.",
      recommendedReplyTone: "Neutral",
      evidence: ["No text messages were available."],
      nextBestAction: "Wait for a text message or continue the chat.",
    };
  }

  const providerConfig = getProviderConfig();

  if (!providerConfig) {
    return localFallback(textMessages);
  }

  const response = await fetch(providerConfig.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${providerConfig.apiKey}`,
      "Content-Type": "application/json",
      ...providerConfig.headers,
    },
    body: JSON.stringify({
      model: providerConfig.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You analyze WhatsApp business chats. Return only valid JSON. Focus on the other person's mood, how the conversation is going, and exactly what chat evidence the decision is based on. Do not invent facts.",
        },
        {
          role: "user",
          content: `Analyze this chat transcript. The INBOUND speaker is the person/customer whose mood we need.

Return JSON with these exact keys:
personMood: short label like happy, interested, confused, frustrated, neutral, urgent
moodScore: number from -100 to 100
conversationDirection: short label for how the conversation is going
confidence: number from 0 to 100
summary: one sentence
decidedOn: one sentence explaining what signals/messages this analysis is decided on
recommendedReplyTone: short reply tone recommendation
evidence: 2-4 short quoted or paraphrased signals from the transcript
nextBestAction: one concrete next action

Transcript:
${formatTranscript(textMessages)}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Analysis API failed (${response.status}): ${body.slice(0, 240)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;

  if (typeof content !== "string") {
    throw new Error("Analysis API returned an empty response.");
  }

  const parsed = analysisSchema.parse(extractJson(content));

  return {
    provider: providerConfig.provider,
    model: providerConfig.model,
    ...parsed,
  };
}
