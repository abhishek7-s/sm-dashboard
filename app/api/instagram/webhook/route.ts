/**
 * Instagram Webhook endpoint
 * GET  — Hub verification (Facebook calls this when you register the webhook)
 * POST — Receive real-time events (comments, mentions, DMs)
 */

import { NextRequest, NextResponse } from "next/server";
import {
  verifyHubChallenge,
  verifyWebhookSignature,
  parseWebhookEvents,
  type IgWebhookPayload,
} from "@/lib/instagram/webhooks";
import { prisma } from "@/lib/db";
import { upsertIgCommentFromWebhook, upsertIgDm } from "@/lib/instagram/persistence";
import { revalidatePath } from "next/cache";

// ─── GET: Hub verification ────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN ?? "";
  const validChallenge = verifyHubChallenge(mode, token, challenge, verifyToken);

  if (!validChallenge) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  return new NextResponse(validChallenge, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

// ─── POST: Receive events ─────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256") ?? "";
  const appSecret = process.env.INSTAGRAM_APP_SECRET ?? "";

  // Verify signature
  if (appSecret && !verifyWebhookSignature(rawBody, signature, appSecret)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let payload: IgWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as IgWebhookPayload;
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  if (payload.object !== "instagram") {
    return new NextResponse("Not an Instagram webhook", { status: 400 });
  }

  const events = parseWebhookEvents(payload);

  for (const event of events) {
    try {
      // Find the channel account matching this IG account ID
      const account = await prisma.channelAccount.findFirst({
        where: {
          provider: "INSTAGRAM_GRAPH_API",
          igUserId: event.igAccountId,
        },
      });

      if (!account) continue;

      if (event.type === "comment") {
        await upsertIgCommentFromWebhook({
          channelAccountId: account.id,
          mediaExternalId: event.mediaId,
          commentExternalId: event.commentId,
          text: event.text,
          username: event.from.username,
          userId: event.from.id,
          parentCommentExternalId: event.parentId,
        });
      }
      // message / mention events: log for now, full handling via sync
    } catch (err) {
      console.error("Failed to handle IG webhook event", event, err);
    }
  }

  // Revalidate the Instagram page so new comments appear
  try {
    revalidatePath("/instagram");
  } catch {
    // revalidatePath may throw outside a render context — ignore
  }

  return NextResponse.json({ ok: true });
}
