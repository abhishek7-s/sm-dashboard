/**
 * Instagram OAuth helpers — Facebook Login flow
 * Uses Facebook Login OAuth flow, which is REQUIRED for Instagram DMs.
 */

const GRAPH_BASE = "https://graph.facebook.com/v22.0";

// Required scopes for the dashboard features
export const INSTAGRAM_SCOPES = [
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_comments",
  "instagram_manage_messages",
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_metadata",
  "pages_messaging",
  "business_management",
].join(",");

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
}

// ─── OAuth URL ───────────────────────────────────────────────────────────────

/** Generate the Facebook Login OAuth URL */
export function getOAuthUrl(state?: string): string {
  const appId = getRequiredEnv("INSTAGRAM_APP_ID");
  const redirectUri = getRequiredEnv("INSTAGRAM_REDIRECT_URI");

  const url = new URL("https://www.facebook.com/v22.0/dialog/oauth");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", INSTAGRAM_SCOPES);
  url.searchParams.set("response_type", "code");
  if (state) {
    url.searchParams.set("state", state);
  }
  return url.toString();
}

// ─── Token Exchange ───────────────────────────────────────────────────────────

type ShortLivedTokenResponse = {
  access_token: string;
  token_type: string;
};

type LongLivedTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number; // seconds
};

/** Exchange a short-lived code for a long-lived (60-day) user access token */
export async function exchangeCodeForToken(code: string): Promise<{
  accessToken: string;
  expiresAt: Date;
}> {
  const appId = getRequiredEnv("INSTAGRAM_APP_ID");
  const appSecret = getRequiredEnv("INSTAGRAM_APP_SECRET");
  const redirectUri = getRequiredEnv("INSTAGRAM_REDIRECT_URI");

  // Step 1: Get short-lived token
  const shortUrl = new URL(`${GRAPH_BASE}/oauth/access_token`);
  shortUrl.searchParams.set("client_id", appId);
  shortUrl.searchParams.set("client_secret", appSecret);
  shortUrl.searchParams.set("redirect_uri", redirectUri);
  shortUrl.searchParams.set("code", code);

  const shortRes = await fetch(shortUrl.toString());
  const shortJson = (await shortRes.json()) as ShortLivedTokenResponse & {
    error?: { message: string };
  };

  if (!shortRes.ok || shortJson.error) {
    throw new Error(`Short-lived token exchange failed: ${shortJson.error?.message ?? shortRes.statusText}`);
  }

  const shortLivedToken = shortJson.access_token;

  // Step 2: Exchange for long-lived token
  const longUrl = new URL(`${GRAPH_BASE}/oauth/access_token`);
  longUrl.searchParams.set("grant_type", "fb_exchange_token");
  longUrl.searchParams.set("client_id", appId);
  longUrl.searchParams.set("client_secret", appSecret);
  longUrl.searchParams.set("fb_exchange_token", shortLivedToken);

  const longRes = await fetch(longUrl.toString());
  const longJson = (await longRes.json()) as LongLivedTokenResponse & {
    error?: { message: string };
  };

  if (!longRes.ok || longJson.error) {
    throw new Error(`Long-lived token exchange failed: ${longJson.error?.message ?? longRes.statusText}`);
  }

  const expiresInSeconds = longJson.expires_in ?? (60 * 24 * 60 * 60);
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

  return {
    accessToken: longJson.access_token,
    expiresAt,
  };
}

/** Get the Instagram Business/Creator account ID linked to the user token */
export async function getIgAccountId(token: string): Promise<{
  igUserId: string;
  igUsername: string;
  igProfilePicUrl?: string;
  displayName: string;
} | null> {
  // Get Facebook pages the user manages
  const pagesUrl = new URL(`${GRAPH_BASE}/me/accounts`);
  pagesUrl.searchParams.set("access_token", token);
  pagesUrl.searchParams.set(
    "fields",
    "id,name,instagram_business_account{id,username,name,profile_picture_url}",
  );

  const pagesRes = await fetch(pagesUrl.toString());
  const pagesJson = await pagesRes.json();

  if (!pagesRes.ok || pagesJson.error) {
    throw new Error(`Failed to fetch pages: ${pagesJson.error?.message ?? pagesRes.statusText}`);
  }

  // Find the first page with an IG business account
  const pages = (
    pagesJson as {
      data: {
        id: string;
        name: string;
        instagram_business_account?: {
          id: string;
          username: string;
          name: string;
          profile_picture_url?: string;
        };
      }[];
    }
  ).data;

  for (const page of pages) {
    if (page.instagram_business_account) {
      const iga = page.instagram_business_account;
      return {
        igUserId: iga.id,
        igUsername: iga.username,
        igProfilePicUrl: iga.profile_picture_url,
        displayName: iga.name || iga.username,
      };
    }
  }

  return null;
}

// ─── Token Refresh ───────────────────────────────────────────────────────────

export async function refreshLongLivedToken(token: string): Promise<{
  accessToken: string;
  expiresAt: Date;
}> {
  // For FB Login tokens, refresh isn't via a simple refresh endpoint, it's getting a new token
  // But we can simulate it or just return the existing if it's still valid
  const url = new URL(`${GRAPH_BASE}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", getRequiredEnv("INSTAGRAM_APP_ID"));
  url.searchParams.set("client_secret", getRequiredEnv("INSTAGRAM_APP_SECRET"));
  url.searchParams.set("fb_exchange_token", token);

  const res = await fetch(url.toString());
  const json = (await res.json()) as LongLivedTokenResponse & {
    error?: { message: string };
  };

  if (!res.ok || json.error) {
    throw new Error(`Token refresh failed: ${json.error?.message ?? res.statusText}`);
  }

  const expiresAt = new Date(Date.now() + json.expires_in * 1000);
  return { accessToken: json.access_token, expiresAt };
}

export function tokenNeedsRefresh(expiresAt: Date | null): boolean {
  if (!expiresAt) return true;
  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return expiresAt < sevenDaysFromNow;
}

export async function revokeToken(token: string): Promise<void> {
  const url = new URL(`${GRAPH_BASE}/me/permissions`);
  url.searchParams.set("access_token", token);
  await fetch(url.toString(), { method: "DELETE" }).catch(() => {});
}
