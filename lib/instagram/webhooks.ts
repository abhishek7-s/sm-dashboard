/**
 * Instagram Webhook helpers — signature verification and event routing
 */

import crypto from "node:crypto";

// ─── Types ───────────────────────────────────────────────────────────────────

export type IgWebhookEntry = {
  id: string; // IG account ID
  time: number;
  changes: IgWebhookChange[];
  messaging?: IgWebhookMessaging[];
};

export type IgWebhookChange = {
  field: string; // "comments" | "mentions" | "story_insights" | etc.
  value: {
    media_id?: string;
    comment_id?: string;
    text?: string;
    from?: { id: string; username: string };
    parent_id?: string;
    item?: string;
    verb?: string;
  };
};

export type IgWebhookMessaging = {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: {
    mid: string;
    text?: string;
    attachments?: { type: string; payload: { url: string } }[];
  };
};

export type IgWebhookPayload = {
  object: string; // "instagram"
  entry: IgWebhookEntry[];
};

// ─── Signature Verification ───────────────────────────────────────────────────

/**
 * Verify Facebook's X-Hub-Signature-256 header.
 * Returns true if the signature is valid.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  appSecret: string,
): boolean {
  if (!signature.startsWith("sha256=")) {
    return false;
  }

  const expected = `sha256=${crypto
    .createHmac("sha256", appSecret)
    .update(rawBody, "utf8")
    .digest("hex")}`;

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

// ─── Hub Verification ────────────────────────────────────────────────────────

/**
 * Handle the GET challenge when Facebook verifies the webhook endpoint.
 * Returns the challenge string if valid, null otherwise.
 */
export function verifyHubChallenge(
  mode: string | null,
  token: string | null,
  challenge: string | null,
  verifyToken: string,
): string | null {
  if (mode === "subscribe" && token === verifyToken && challenge) {
    return challenge;
  }
  return null;
}

// ─── Event Parsing ───────────────────────────────────────────────────────────

export type ParsedIgEvent =
  | { type: "comment"; igAccountId: string; mediaId: string; commentId: string; text: string; from: { id: string; username: string }; parentId?: string }
  | { type: "mention"; igAccountId: string; mediaId: string; commentId?: string; text?: string }
  | { type: "message"; igAccountId: string; senderId: string; text: string; mid: string; timestamp: number }
  | { type: "unknown"; igAccountId: string; field: string };

/** Parse raw webhook payload into typed events */
export function parseWebhookEvents(payload: IgWebhookPayload): ParsedIgEvent[] {
  const events: ParsedIgEvent[] = [];

  for (const entry of payload.entry) {
    const igAccountId = entry.id;

    // Handle changes (comments, mentions)
    for (const change of entry.changes ?? []) {
      if (change.field === "comments") {
        const v = change.value;
        if (v.media_id && v.comment_id) {
          events.push({
            type: "comment",
            igAccountId,
            mediaId: v.media_id,
            commentId: v.comment_id,
            text: v.text ?? "",
            from: v.from ?? { id: "", username: "" },
            parentId: v.parent_id,
          });
        }
      } else if (change.field === "mentions") {
        const v = change.value;
        events.push({
          type: "mention",
          igAccountId,
          mediaId: v.media_id ?? "",
          commentId: v.comment_id,
          text: v.text,
        });
      } else {
        events.push({ type: "unknown", igAccountId, field: change.field });
      }
    }

    // Handle messaging (DMs)
    for (const msg of entry.messaging ?? []) {
      if (msg.message) {
        events.push({
          type: "message",
          igAccountId,
          senderId: msg.sender.id,
          text: msg.message.text ?? "",
          mid: msg.message.mid,
          timestamp: msg.timestamp,
        });
      }
    }
  }

  return events;
}
