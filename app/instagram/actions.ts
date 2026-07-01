"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import {
  getMedia,
  getComments,
  replyToComment as apiReplyToComment,
  getMediaInsights,
  createMediaContainer,
  publishMediaContainer,
  getConversations,
  sendDM as apiSendDM,
  getMonitorAccountMedia,
} from "@/lib/instagram/api";
import {
  upsertIgPosts,
  upsertIgComments,
  markCommentReplied,
  updateIgPostInsights,
  upsertIgDm,
  upsertMonitorTarget,
  upsertMonitorPosts,
  markIgAccountDisconnected,
} from "@/lib/instagram/persistence";
import { refreshLongLivedToken, tokenNeedsRefresh } from "@/lib/instagram/auth";
import { updateIgToken } from "@/lib/instagram/persistence";

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function getIgAccount() {
  const account = await prisma.channelAccount.findFirst({
    where: { provider: "INSTAGRAM_GRAPH_API", status: "CONNECTED" },
    orderBy: { updatedAt: "desc" },
  });

  if (!account || !account.igAccessToken || !account.igUserId) {
    return null;
  }

  // Refresh token if nearing expiry
  if (tokenNeedsRefresh(account.igTokenExpiresAt)) {
    try {
      const { accessToken, expiresAt } = await refreshLongLivedToken(account.igAccessToken);
      await updateIgToken(account.id, accessToken, expiresAt);
      return { ...account, igAccessToken: accessToken };
    } catch {
      // Token refresh failed — continue with existing token
    }
  }

  return account;
}

// ─── Posts & Feed ─────────────────────────────────────────────────────────────

/** Sync latest posts from Instagram to the database */
export async function syncInstagramPosts() {
  const account = await getIgAccount();
  if (!account) return { error: "No connected Instagram account" };

  try {
    const { data: media } = await getMedia(
      account.igAccessToken!,
      account.igUserId!,
      30,
    );
    const saved = await upsertIgPosts(account.id, media);
    revalidatePath("/instagram");
    return { success: true, count: saved.length };
  } catch (err) {
    return { error: String(err instanceof Error ? err.message : err) };
  }
}

// ─── Insights ────────────────────────────────────────────────────────────────

/** Sync insights for a specific post */
export async function syncPostInsights(postDbId: string) {
  const account = await getIgAccount();
  if (!account) return { error: "No connected Instagram account" };

  const post = await prisma.igPost.findUnique({ where: { id: postDbId } });
  if (!post) return { error: "Post not found" };

  try {
    const { data: insights } = await getMediaInsights(
      account.igAccessToken!,
      post.externalId,
      post.mediaType,
    );
    await updateIgPostInsights(account.id, post.externalId, insights);
    revalidatePath("/instagram");
    return { success: true };
  } catch (err) {
    return { error: String(err instanceof Error ? err.message : err) };
  }
}

/** Sync insights for all posts */
export async function syncAllInsights() {
  const account = await getIgAccount();
  if (!account) return { error: "No connected Instagram account" };

  const posts = await prisma.igPost.findMany({
    where: { channelAccountId: account.id, isStory: false },
    orderBy: { postedAt: "desc" },
    take: 20,
    select: { id: true },
  });

  const results = await Promise.allSettled(
    posts.map((p) => syncPostInsights(p.id)),
  );

  const failed = results.filter((r) => r.status === "rejected").length;
  revalidatePath("/instagram");
  return { success: true, total: posts.length, failed };
}

// ─── Comments ────────────────────────────────────────────────────────────────

/** Sync comments for a specific post from the API */
export async function syncPostComments(postDbId: string) {
  const account = await getIgAccount();
  if (!account) return { error: "No connected Instagram account" };

  const post = await prisma.igPost.findUnique({ where: { id: postDbId } });
  if (!post) return { error: "Post not found" };

  try {
    const { data: comments } = await getComments(
      account.igAccessToken!,
      post.externalId,
    );
    await upsertIgComments(post.id, comments);
    revalidatePath("/instagram");
    return { success: true, count: comments.length };
  } catch (err) {
    return { error: String(err instanceof Error ? err.message : err) };
  }
}

/** Reply to an Instagram comment */
export async function replyToIgComment(commentDbId: string, text: string) {
  if (!text.trim()) return { error: "Reply text cannot be empty" };

  const account = await getIgAccount();
  if (!account) return { error: "No connected Instagram account" };

  const comment = await prisma.igComment.findUnique({ where: { id: commentDbId } });
  if (!comment) return { error: "Comment not found" };

  try {
    await apiReplyToComment(account.igAccessToken!, comment.externalId, text.trim());
    await markCommentReplied(commentDbId, text.trim());
    revalidatePath("/instagram");
    return { success: true };
  } catch (err) {
    await prisma.igComment.update({
      where: { id: commentDbId },
      data: { replyStatus: "FAILED" },
    });
    return { error: String(err instanceof Error ? err.message : err) };
  }
}

// ─── Publishing ───────────────────────────────────────────────────────────────

export type PublishMediaType = "IMAGE" | "REEL" | "STORY_IMAGE" | "STORY_VIDEO";

/** Publish a new post / reel / story to Instagram */
export async function publishInstagramPost(opts: {
  imageUrl?: string;
  videoUrl?: string;
  caption?: string;
  mediaType: PublishMediaType;
}) {
  const account = await getIgAccount();
  if (!account) return { error: "No connected Instagram account" };

  const { imageUrl, videoUrl, caption, mediaType } = opts;

  if (!imageUrl && !videoUrl) {
    return { error: "Either imageUrl or videoUrl is required" };
  }

  try {
    let apiMediaType: "REELS" | "STORIES" | undefined;
    if (mediaType === "REEL") apiMediaType = "REELS";
    if (mediaType === "STORY_IMAGE" || mediaType === "STORY_VIDEO") apiMediaType = "STORIES";

    // Step 1: Create container
    const container = await createMediaContainer(
      account.igAccessToken!,
      account.igUserId!,
      { imageUrl, videoUrl, caption, mediaType: apiMediaType },
    );

    // For videos/reels, we'd poll container status; for images, publish immediately
    // Step 2: Publish
    const published = await publishMediaContainer(
      account.igAccessToken!,
      account.igUserId!,
      container.id,
    );

    // Sync the new post back to the DB
    await syncInstagramPosts();
    revalidatePath("/instagram");
    return { success: true, mediaId: published.id };
  } catch (err) {
    return { error: String(err instanceof Error ? err.message : err) };
  }
}

// ─── DMs ─────────────────────────────────────────────────────────────────────

/** Sync DM conversations from Instagram */
export async function syncInstagramDMs() {
  const account = await getIgAccount();
  if (!account) return { error: "No connected Instagram account" };

  try {
    const { data: conversations } = await getConversations(
      account.igAccessToken!,
      account.igUserId!,
    );

    for (const conv of conversations) {
      await upsertIgDm(account.id, conv, account.igUserId!);
    }

    revalidatePath("/instagram");
    return { success: true, count: conversations.length };
  } catch (err) {
    return { error: String(err instanceof Error ? err.message : err) };
  }
}

/** Send a DM (only works if within 24-hour messaging window) */
export async function sendInstagramDM(recipientIgId: string, text: string) {
  if (!text.trim()) return { error: "Message cannot be empty" };

  const account = await getIgAccount();
  if (!account) return { error: "No connected Instagram account" };

  try {
    await apiSendDM(
      account.igAccessToken!,
      account.igUserId!,
      recipientIgId,
      text.trim(),
    );
    await syncInstagramDMs();
    return { success: true };
  } catch (err) {
    return { error: String(err instanceof Error ? err.message : err) };
  }
}

// ─── Monitor Targets ─────────────────────────────────────────────────────────

/** Add a new Instagram account to monitor */
export async function addMonitorTarget(username: string) {
  const cleaned = username.trim().replace(/^@/, "");
  if (!cleaned) return { error: "Username cannot be empty" };

  const account = await getIgAccount();
  if (!account) return { error: "No connected Instagram account" };

  try {
    // Try to resolve via Business Discovery API
    let businessId: string | undefined;
    let displayName: string | undefined;
    let profilePicUrl: string | undefined;

    try {
      const bizData = await getMonitorAccountMedia(
        account.igAccessToken!,
        account.igUserId!,
        cleaned,
        5,
      );
      businessId = bizData.id;
      displayName = bizData.name;
      profilePicUrl = bizData.profile_picture_url;

      // Immediately save their posts
      const target = await upsertMonitorTarget(account.id, {
        username: cleaned,
        igBusinessId: businessId,
        displayName,
        profilePicUrl,
      });

      await upsertMonitorPosts(target.id, bizData.media?.data ?? []);
    } catch {
      // Business Discovery failed (personal account?) — save target anyway
      await upsertMonitorTarget(account.id, { username: cleaned });
    }

    revalidatePath("/instagram");
    return { success: true };
  } catch (err) {
    return { error: String(err instanceof Error ? err.message : err) };
  }
}

/** Remove a monitor target */
export async function removeMonitorTarget(targetId: string) {
  await prisma.igMonitorTarget.delete({ where: { id: targetId } });
  revalidatePath("/instagram");
  return { success: true };
}

/** Toggle a monitor target on/off */
export async function toggleMonitorTarget(targetId: string, enabled: boolean) {
  await prisma.igMonitorTarget.update({
    where: { id: targetId },
    data: { enabled },
  });
  revalidatePath("/instagram");
  return { success: true };
}

/** Sync all enabled monitor targets */
export async function syncMonitorTargets() {
  const account = await getIgAccount();
  if (!account) return { error: "No connected Instagram account" };

  const targets = await prisma.igMonitorTarget.findMany({
    where: { channelAccountId: account.id, enabled: true },
  });

  let totalNew = 0;

  for (const target of targets) {
    try {
      const bizData = await getMonitorAccountMedia(
        account.igAccessToken!,
        account.igUserId!,
        target.username,
        10,
      );
      const newCount = await upsertMonitorPosts(target.id, bizData.media?.data ?? []);
      totalNew += newCount;
    } catch (err) {
      console.error(`Failed to sync monitor target @${target.username}`, err);
    }
  }

  revalidatePath("/instagram");
  return { success: true, newPosts: totalNew };
}

// ─── Disconnect ───────────────────────────────────────────────────────────────

/** Disconnect the Instagram account */
export async function disconnectInstagram() {
  const account = await prisma.channelAccount.findFirst({
    where: { provider: "INSTAGRAM_GRAPH_API" },
    orderBy: { updatedAt: "desc" },
  });

  if (!account) return { success: true };

  await markIgAccountDisconnected(account.id);
  revalidatePath("/instagram");
  return { success: true };
}
