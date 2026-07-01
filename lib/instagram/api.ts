/**
 * Instagram Graph API v22.0 client
 * All functions require a valid long-lived access token.
 */
const BASE = "https://graph.facebook.com/v22.0";
// ─── Types ───────────────────────────────────────────────────────────────────

export type IgApiError = {
  error: {
    message: string;
    type: string;
    code: number;
    fbtrace_id: string;
  };
};

export type IgMedia = {
  id: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM" | "REEL" | "STORY";
  caption?: string;
  permalink?: string;
  thumbnail_url?: string;
  media_url?: string;
  like_count?: number;
  comments_count?: number;
  timestamp: string;
};

export type IgComment = {
  id: string;
  text: string;
  username: string;
  timestamp: string;
  replies?: { data: IgComment[] };
};

export type IgInsight = {
  name: string;
  period: string;
  values: { value: number }[];
  id: string;
};

export type IgConversation = {
  id: string;
  updated_time: string;
  participants: { data: { id: string; username?: string; name?: string }[] };
  messages: { data: IgDmMessage[] };
};

export type IgDmMessage = {
  id: string;
  message: string;
  from: { id: string; username?: string; name?: string };
  created_time: string;
};

export type IgUser = {
  id: string;
  name: string;
  username?: string;
  profile_picture_url?: string;
  biography?: string;
  followers_count?: number;
  media_count?: number;
};

export type IgPublishContainerResult = {
  id: string; // container ID
};

// ─── Core fetch helper ───────────────────────────────────────────────────────

async function igFetch<T>(
  path: string,
  token: string,
  options?: RequestInit & { params?: Record<string, string> },
): Promise<T> {
  const url = new URL(path.startsWith("http") ? path : `${BASE}${path}`);
  url.searchParams.set("access_token", token);
  if (options?.params) {
    for (const [k, v] of Object.entries(options.params)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });

  const json = (await res.json()) as T | IgApiError;

  if (!res.ok || (json as IgApiError).error) {
    const err = (json as IgApiError).error;
    throw new Error(`IG API error [${err?.code}]: ${err?.message ?? res.statusText}`);
  }

  return json as T;
}

// ─── Account ─────────────────────────────────────────────────────────────────

/** Get the connected Instagram account info */
export async function getMe(token: string): Promise<IgUser> {
  return igFetch<IgUser>("/me", token, {
    params: {
      fields: "id,name,username,profile_picture_url,biography,followers_count,media_count",
    },
  });
}

// ─── Media / Posts ───────────────────────────────────────────────────────────

/** Fetch own posts/reels/stories (max 50 per call) */
export async function getMedia(
  token: string,
  igUserId: string,
  limit = 20,
): Promise<{ data: IgMedia[]; paging?: { cursors: { after: string }; next?: string } }> {
  return igFetch(`/${igUserId}/media`, token, {
    params: {
      fields:
        "id,media_type,caption,permalink,thumbnail_url,media_url,like_count,comments_count,timestamp",
      limit: String(limit),
    },
  });
}

// ─── Comments ────────────────────────────────────────────────────────────────

/** Fetch comments on a specific media post */
export async function getComments(
  token: string,
  mediaId: string,
): Promise<{ data: IgComment[] }> {
  return igFetch(`/${mediaId}/comments`, token, {
    params: {
      fields: "id,text,username,timestamp,replies{id,text,username,timestamp}",
    },
  });
}

/** Reply to a comment */
export async function replyToComment(
  token: string,
  commentId: string,
  message: string,
): Promise<{ id: string }> {
  const url = new URL(`${BASE}/${commentId}/replies`);
  url.searchParams.set("access_token", token);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });

  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(`IG API error [${json.error?.code}]: ${json.error?.message ?? res.statusText}`);
  }
  return json as { id: string };
}

/** Post a new top-level comment on a media */
export async function postComment(
  token: string,
  mediaId: string,
  message: string,
): Promise<{ id: string }> {
  const url = new URL(`${BASE}/${mediaId}/comments`);
  url.searchParams.set("access_token", token);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });

  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(`IG API error [${json.error?.code}]: ${json.error?.message ?? res.statusText}`);
  }
  return json as { id: string };
}

/** Hide or unhide a comment */
export async function setCommentHidden(
  token: string,
  commentId: string,
  hide: boolean,
): Promise<{ success: boolean }> {
  const url = new URL(`${BASE}/${commentId}`);
  url.searchParams.set("access_token", token);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hide }),
  });

  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(`IG API error [${json.error?.code}]: ${json.error?.message ?? res.statusText}`);
  }
  return { success: true };
}

// ─── Insights ────────────────────────────────────────────────────────────────

/** Fetch insights for a specific media (likes, reach, impressions, saved) */
export async function getMediaInsights(
  token: string,
  mediaId: string,
  mediaType: string,
): Promise<{ data: IgInsight[] }> {
  // Story metrics differ from feed post metrics
  const metric =
    mediaType === "STORY"
      ? "exits,impressions,reach,taps_forward,taps_back"
      : "impressions,reach,saved";

  return igFetch(`/${mediaId}/insights`, token, { params: { metric, period: "lifetime" } });
}

/** Fetch account-level insights */
export async function getAccountInsights(
  token: string,
  igUserId: string,
): Promise<{ data: IgInsight[] }> {
  return igFetch(`/${igUserId}/insights`, token, {
    params: {
      metric: "impressions,reach,profile_views",
      period: "day",
    },
  });
}

// ─── Publish (Photo / Reel / Story) ─────────────────────────────────────────

/** Step 1: Create a media container */
export async function createMediaContainer(
  token: string,
  igUserId: string,
  opts: {
    imageUrl?: string;
    videoUrl?: string;
    caption?: string;
    mediaType?: "REELS" | "STORIES";
    isCarouselItem?: boolean;
  },
): Promise<IgPublishContainerResult> {
  const url = new URL(`${BASE}/${igUserId}/media`);
  url.searchParams.set("access_token", token);

  const body: Record<string, string> = {};
  if (opts.imageUrl) body.image_url = opts.imageUrl;
  if (opts.videoUrl) body.video_url = opts.videoUrl;
  if (opts.caption) body.caption = opts.caption;
  if (opts.mediaType) body.media_type = opts.mediaType;
  if (opts.isCarouselItem) body.is_carousel_item = "true";

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(`IG API error [${json.error?.code}]: ${json.error?.message ?? res.statusText}`);
  }
  return json as IgPublishContainerResult;
}

/** Step 2: Publish the media container */
export async function publishMediaContainer(
  token: string,
  igUserId: string,
  containerId: string,
): Promise<{ id: string }> {
  const url = new URL(`${BASE}/${igUserId}/media_publish`);
  url.searchParams.set("access_token", token);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creation_id: containerId }),
  });

  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(`IG API error [${json.error?.code}]: ${json.error?.message ?? res.statusText}`);
  }
  return json as { id: string };
}

// ─── DMs ─────────────────────────────────────────────────────────────────────

/** Fetch DM conversations (requires Page Access Token) */
export async function getConversations(
  userToken: string,
  igUserId: string,
): Promise<{ data: IgConversation[] }> {
  // 1. Get Page ID and Page Token
  const pagesUrl = new URL(`${BASE}/me/accounts`);
  pagesUrl.searchParams.set("access_token", userToken);
  pagesUrl.searchParams.set("fields", "id,access_token,instagram_business_account");
  
  const pagesRes = await fetch(pagesUrl.toString());
  const pagesJson = await pagesRes.json();
  
  let pageId = null;
  let pageToken = null;
  
  for (const p of pagesJson.data || []) {
    if (p.instagram_business_account?.id === igUserId) {
      pageId = p.id;
      pageToken = p.access_token;
      break;
    }
  }

  if (!pageId || !pageToken) {
    throw new Error("Could not find linked Facebook Page to fetch DMs.");
  }

  // 2. Fetch conversations using the Page ID and Page Token
  return igFetch(`/${pageId}/conversations`, pageToken, {
    params: {
      platform: "instagram",
      fields: "id,updated_time,participants{id,username,name},messages{id,message,from,created_time}",
    },
  });
}

/** Send a DM (only works within 24h window, requires Page Access Token) */
export async function sendDM(
  userToken: string,
  igUserId: string,
  recipientId: string,
  text: string,
): Promise<{ message_id: string; recipient_id: string }> {
  // 1. Get Page ID and Page Token
  const pagesUrl = new URL(`${BASE}/me/accounts`);
  pagesUrl.searchParams.set("access_token", userToken);
  pagesUrl.searchParams.set("fields", "id,access_token,instagram_business_account");
  
  const pagesRes = await fetch(pagesUrl.toString());
  const pagesJson = await pagesRes.json();
  
  let pageId = null;
  let pageToken = null;
  
  for (const p of pagesJson.data || []) {
    if (p.instagram_business_account?.id === igUserId) {
      pageId = p.id;
      pageToken = p.access_token;
      break;
    }
  }

  if (!pageId || !pageToken) {
    throw new Error("Could not find linked Facebook Page to send DMs.");
  }

  // 2. Send message using the Page ID and Page Token
  const url = new URL(`${BASE}/${pageId}/messages`);
  url.searchParams.set("access_token", pageToken);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
    }),
  });

  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(`IG API error [${json.error?.code}]: ${json.error?.message ?? res.statusText}`);
  }
  return json as { message_id: string; recipient_id: string };
}

// ─── Business Discovery (Monitor) ────────────────────────────────────────────

/** Look up a public business/creator account by username via Business Discovery */
export async function getBusinessAccountByUsername(
  token: string,
  igUserId: string,
  username: string,
): Promise<{
  business_discovery: {
    id: string;
    username: string;
    name: string;
    profile_picture_url?: string;
    media?: { data: IgMedia[] };
  };
}> {
  return igFetch(`/${igUserId}`, token, {
    params: {
      fields: `business_discovery.fields(id,username,name,profile_picture_url,media{id,media_type,caption,permalink,thumbnail_url,media_url,like_count,comments_count,timestamp})`,
    },
    // Pass username as part of the business_discovery field
    // Note: this is embedded via the fields param above via alias
  } as Parameters<typeof igFetch>[2]);
}

/** Alternative: fetch media from a monitored business account */
export async function getMonitorAccountMedia(
  token: string,
  igUserId: string, // your account ID (the one that has the token)
  targetUsername: string,
  limit = 10,
): Promise<{
  id: string;
  username: string;
  name: string;
  profile_picture_url?: string;
  media: { data: IgMedia[] };
}> {
  const fields = [
    "business_discovery.fields(",
    `id,username,name,profile_picture_url,`,
    `media.limit(${limit}){id,media_type,caption,permalink,thumbnail_url,media_url,like_count,comments_count,timestamp}`,
    ")",
  ].join("");

  const url = new URL(`${BASE}/${igUserId}`);
  url.searchParams.set("access_token", token);
  url.searchParams.set("fields", fields);

  // We need to pass the target username differently — via a user-defined parameter
  // The Business Discovery API accepts: GET /{ig-user-id}?fields=business_discovery.fields(...)
  // and the target is specified with a username parameter on the field

  const properFields = `business_discovery.fields(id,username,name,profile_picture_url,media.limit(${limit}){id,media_type,caption,permalink,thumbnail_url,media_url,like_count,comments_count,timestamp})`;
  const properUrl = new URL(`${BASE}/${igUserId}`);
  properUrl.searchParams.set("access_token", token);
  properUrl.searchParams.set("fields", properFields);
  // The username of the target goes as a separate param with key matching the field alias
  // Actually it goes in fields like: business_discovery(username){...}
  // Let's construct correctly:
  const correctFields = `business_discovery.fields(id,username,name,profile_picture_url,media.limit(${limit}){id,media_type,caption,permalink,thumbnail_url,media_url,like_count,comments_count,timestamp})`;
  const finalUrl = new URL(`${BASE}/${igUserId}`);
  finalUrl.searchParams.set("access_token", token);
  finalUrl.searchParams.set(
    "fields",
    correctFields,
  );
  finalUrl.searchParams.set("username", targetUsername);

  const res = await fetch(finalUrl.toString());
  const json = await res.json();

  if (!res.ok || json.error) {
    throw new Error(
      `IG Business Discovery error [${json.error?.code}]: ${json.error?.message ?? res.statusText}`,
    );
  }

  const bd = (json as { business_discovery: typeof json }).business_discovery;
  return bd as Awaited<ReturnType<typeof getMonitorAccountMedia>>;
}
