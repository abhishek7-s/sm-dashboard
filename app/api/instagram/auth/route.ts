import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForToken, getIgAccountId } from "@/lib/instagram/auth";
import { upsertIgChannelAccount } from "@/lib/instagram/persistence";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // User denied permissions
  if (error) {
    const url = new URL("/instagram", appUrl);
    url.searchParams.set("error", errorDescription ?? error);
    return NextResponse.redirect(url.toString());
  }

  if (!code) {
    const url = new URL("/instagram", appUrl);
    url.searchParams.set("error", "No authorization code received");
    return NextResponse.redirect(url.toString());
  }

  try {
    // Exchange code for long-lived FB token
    const { accessToken, expiresAt } = await exchangeCodeForToken(code);

    // Resolve the IG Business/Creator account ID via linked Pages
    const igAccount = await getIgAccountId(accessToken);

    if (!igAccount) {
      const url = new URL("/instagram", appUrl);
      url.searchParams.set(
        "error",
        "No Instagram Business or Creator account found linked to this Facebook profile. Make sure your IG account is a Business or Creator account and linked to a Facebook Page.",
      );
      return NextResponse.redirect(url.toString());
    }

    // Persist to DB
    await upsertIgChannelAccount({
      igUserId: igAccount.igUserId,
      igUsername: igAccount.igUsername,
      displayName: igAccount.displayName,
      igProfilePicUrl: igAccount.igProfilePicUrl,
      accessToken,
      tokenExpiresAt: expiresAt,
    });

    const url = new URL("/instagram", appUrl);
    url.searchParams.set("connected", "1");
    return NextResponse.redirect(url.toString());
  } catch (err) {
    console.error("Instagram OAuth error", err);
    const url = new URL("/instagram", appUrl);
    url.searchParams.set("error", String(err instanceof Error ? err.message : err));
    return NextResponse.redirect(url.toString());
  }
}
