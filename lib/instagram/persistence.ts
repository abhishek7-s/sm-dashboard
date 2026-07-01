/**
 * Instagram persistence helpers — save/update IG data to Prisma
 */

import { prisma } from "@/lib/db";
import type { IgMedia, IgComment, IgInsight, IgConversation } from "./api";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toMediaType(
  raw: string,
): "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM" | "REEL" | "STORY" {
  const upper = raw.toUpperCase();
  if (
    upper === "IMAGE" ||
    upper === "VIDEO" ||
    upper === "CAROUSEL_ALBUM" ||
    upper === "REEL" ||
    upper === "STORY"
  ) {
    return upper as ReturnType<typeof toMediaType>;
  }
  return "IMAGE";
}

// ─── Channel Account ─────────────────────────────────────────────────────────

/** Upsert an Instagram ChannelAccount record after successful OAuth */
export async function upsertIgChannelAccount(opts: {
  igUserId: string;
  igUsername?: string;
  displayName: string;
  igProfilePicUrl?: string;
  accessToken: string;
  tokenExpiresAt: Date;
}) {
  return prisma.channelAccount.upsert({
    where: {
      provider_externalAccountId: {
        provider: "INSTAGRAM_GRAPH_API",
        externalAccountId: opts.igUserId,
      },
    },
    create: {
      type: "INSTAGRAM",
      provider: "INSTAGRAM_GRAPH_API",
      displayName: opts.displayName,
      externalAccountId: opts.igUserId,
      status: "CONNECTED",
      igUserId: opts.igUserId,
      igUsername: opts.igUsername,
      igProfilePicUrl: opts.igProfilePicUrl,
      igAccessToken: opts.accessToken,
      igTokenExpiresAt: opts.tokenExpiresAt,
      lastConnectedAt: new Date(),
    },
    update: {
      displayName: opts.displayName,
      igUsername: opts.igUsername,
      igProfilePicUrl: opts.igProfilePicUrl,
      igAccessToken: opts.accessToken,
      igTokenExpiresAt: opts.tokenExpiresAt,
      status: "CONNECTED",
      lastConnectedAt: new Date(),
    },
  });
}

/** Disconnect an IG account */
export async function markIgAccountDisconnected(channelAccountId: string) {
  return prisma.channelAccount.update({
    where: { id: channelAccountId },
    data: {
      status: "DISCONNECTED",
      igAccessToken: null,
      igTokenExpiresAt: null,
    },
  });
}

/** Update the access token (after refresh) */
export async function updateIgToken(
  channelAccountId: string,
  accessToken: string,
  expiresAt: Date,
) {
  return prisma.channelAccount.update({
    where: { id: channelAccountId },
    data: {
      igAccessToken: accessToken,
      igTokenExpiresAt: expiresAt,
    },
  });
}

// ─── Posts ───────────────────────────────────────────────────────────────────

/** Upsert a list of IgMedia records into IgPost */
export async function upsertIgPosts(channelAccountId: string, media: IgMedia[]) {
  const results: string[] = [];

  for (const m of media) {
    const mediaType = toMediaType(m.media_type);
    await prisma.igPost.upsert({
      where: {
        channelAccountId_externalId: {
          channelAccountId,
          externalId: m.id,
        },
      },
      create: {
        channelAccountId,
        externalId: m.id,
        mediaType,
        caption: m.caption ?? null,
        permalink: m.permalink ?? null,
        thumbnailUrl: m.thumbnail_url ?? null,
        mediaUrl: m.media_url ?? null,
        likeCount: m.like_count ?? 0,
        commentsCount: m.comments_count ?? 0,
        isStory: mediaType === "STORY",
        postedAt: m.timestamp ? new Date(m.timestamp) : null,
      },
      update: {
        caption: m.caption ?? null,
        likeCount: m.like_count ?? 0,
        commentsCount: m.comments_count ?? 0,
        mediaUrl: m.media_url ?? null,
        thumbnailUrl: m.thumbnail_url ?? null,
      },
    });
    results.push(m.id);
  }

  return results;
}

/** Update insights for a single IgPost */
export async function updateIgPostInsights(
  channelAccountId: string,
  mediaExternalId: string,
  insights: IgInsight[],
) {
  const reach = insights.find((i) => i.name === "reach")?.values?.[0]?.value;
  const impressions = insights.find((i) => i.name === "impressions")?.values?.[0]?.value;
  const saved = insights.find((i) => i.name === "saved")?.values?.[0]?.value;

  await prisma.igPost.updateMany({
    where: { channelAccountId, externalId: mediaExternalId },
    data: {
      reach: reach ?? null,
      impressions: impressions ?? null,
      saved: saved ?? null,
      rawInsights: JSON.parse(JSON.stringify(insights)),
    },
  });
}

// ─── Comments ────────────────────────────────────────────────────────────────

/** Upsert comments (and their replies) for a given post */
export async function upsertIgComments(igPostId: string, comments: IgComment[]) {
  for (const c of comments) {
    await prisma.igComment.upsert({
      where: { igPostId_externalId: { igPostId, externalId: c.id } },
      create: {
        igPostId,
        externalId: c.id,
        text: c.text,
        username: c.username,
        timestamp: new Date(c.timestamp),
      },
      update: {
        text: c.text,
      },
    });

    // Upsert replies as child comments
    for (const r of c.replies?.data ?? []) {
      await prisma.igComment.upsert({
        where: { igPostId_externalId: { igPostId, externalId: r.id } },
        create: {
          igPostId,
          externalId: r.id,
          text: r.text,
          username: r.username,
          parentCommentId: (
            await prisma.igComment.findUnique({
              where: { igPostId_externalId: { igPostId, externalId: c.id } },
              select: { id: true },
            })
          )?.id ?? null,
          timestamp: new Date(r.timestamp),
        },
        update: { text: r.text },
      });
    }
  }
}

/** Mark a comment as replied */
export async function markCommentReplied(commentId: string, replyText: string) {
  return prisma.igComment.update({
    where: { id: commentId },
    data: {
      replyStatus: "SENT",
      replyText,
      repliedAt: new Date(),
    },
  });
}

/** Upsert a single comment from a webhook event */
export async function upsertIgCommentFromWebhook(opts: {
  channelAccountId: string;
  mediaExternalId: string;
  commentExternalId: string;
  text: string;
  username: string;
  userId: string;
  parentCommentExternalId?: string;
}) {
  // Find the IgPost record
  const post = await prisma.igPost.findUnique({
    where: {
      channelAccountId_externalId: {
        channelAccountId: opts.channelAccountId,
        externalId: opts.mediaExternalId,
      },
    },
  });

  if (!post) {
    // Post not yet synced — skip for now
    return null;
  }

  let parentCommentId: string | null = null;
  if (opts.parentCommentExternalId) {
    const parent = await prisma.igComment.findUnique({
      where: {
        igPostId_externalId: {
          igPostId: post.id,
          externalId: opts.parentCommentExternalId,
        },
      },
    });
    parentCommentId = parent?.id ?? null;
  }

  return prisma.igComment.upsert({
    where: {
      igPostId_externalId: { igPostId: post.id, externalId: opts.commentExternalId },
    },
    create: {
      igPostId: post.id,
      externalId: opts.commentExternalId,
      text: opts.text,
      username: opts.username,
      userExternalId: opts.userId,
      parentCommentId,
      timestamp: new Date(),
    },
    update: { text: opts.text },
  });
}

// ─── DMs ─────────────────────────────────────────────────────────────────────

/** Upsert a DM conversation thread */
export async function upsertIgDm(
  channelAccountId: string,
  conversation: IgConversation,
  myIgId: string,
) {
  const participant = conversation.participants.data.find((p) => p.id !== myIgId);
  const messages = conversation.messages?.data ?? [];

  // Determine if within 24h window based on the last inbound message
  const lastInbound = messages.find((m) => m.from.id !== myIgId);
  const withinWindow = lastInbound
    ? Date.now() - new Date(lastInbound.created_time).getTime() < 24 * 60 * 60 * 1000
    : false;

  const lastMessageAt =
    messages.length > 0 ? new Date(messages[0].created_time) : null;

  return prisma.igDm.upsert({
    where: {
      channelAccountId_externalId: {
        channelAccountId,
        externalId: conversation.id,
      },
    },
    create: {
      channelAccountId,
      externalId: conversation.id,
      participantUsername: participant?.username ?? participant?.name ?? null,
      participantIgId: participant?.id ?? null,
      messages: JSON.parse(JSON.stringify(messages)),
      lastMessageAt,
      withinWindow,
    },
    update: {
      participantUsername: participant?.username ?? participant?.name ?? null,
      messages: JSON.parse(JSON.stringify(messages)),
      lastMessageAt,
      withinWindow,
    },
  });
}

// ─── Monitor Targets ─────────────────────────────────────────────────────────

/** Add or enable a monitor target */
export async function upsertMonitorTarget(
  channelAccountId: string,
  opts: {
    username: string;
    igBusinessId?: string;
    displayName?: string;
    profilePicUrl?: string;
  },
) {
  return prisma.igMonitorTarget.upsert({
    where: {
      channelAccountId_username: { channelAccountId, username: opts.username },
    },
    create: {
      channelAccountId,
      username: opts.username,
      igBusinessId: opts.igBusinessId ?? null,
      displayName: opts.displayName ?? null,
      profilePicUrl: opts.profilePicUrl ?? null,
      enabled: true,
    },
    update: {
      igBusinessId: opts.igBusinessId ?? undefined,
      displayName: opts.displayName ?? undefined,
      profilePicUrl: opts.profilePicUrl ?? undefined,
      enabled: true,
    },
  });
}

/** Upsert posts from a monitored account, returning newly seen post count */
export async function upsertMonitorPosts(
  targetId: string,
  media: IgMedia[],
): Promise<number> {
  let newCount = 0;

  for (const m of media) {
    const existing = await prisma.igMonitorPost.findUnique({
      where: { targetId_externalId: { targetId, externalId: m.id } },
    });

    if (!existing) {
      await prisma.igMonitorPost.create({
        data: {
          targetId,
          externalId: m.id,
          caption: m.caption ?? null,
          permalink: m.permalink ?? null,
          mediaType: toMediaType(m.media_type),
          thumbnailUrl: m.thumbnail_url ?? null,
          mediaUrl: m.media_url ?? null,
          likeCount: m.like_count ?? 0,
          commentsCount: m.comments_count ?? 0,
          postedAt: m.timestamp ? new Date(m.timestamp) : null,
        },
      });
      newCount++;
    }
  }

  // Update lastCheckedAt
  await prisma.igMonitorTarget.update({
    where: { id: targetId },
    data: { lastCheckedAt: new Date() },
  });

  return newCount;
}
