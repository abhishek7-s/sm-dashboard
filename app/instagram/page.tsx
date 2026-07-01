import { prisma } from "@/lib/db";
import Link from "next/link";
import { getOAuthUrl } from "@/lib/instagram/auth";
import { IgConnect } from "./components/ig-connect";
import { IgFeed } from "./components/ig-feed";
import { IgComments } from "./components/ig-comments";
import { IgInsights } from "./components/ig-insights";
import { IgCompose } from "./components/ig-compose";
import { IgDm } from "./components/ig-dm";
import { IgMonitor } from "./components/ig-monitor";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{
    tab?: string;
    post?: string;
    connected?: string;
    error?: string;
  }>;
};

async function getIgDashboardData(selectedPostId?: string) {
  const account = await prisma.channelAccount.findFirst({
    where: { provider: "INSTAGRAM_GRAPH_API", status: "CONNECTED" },
    orderBy: { updatedAt: "desc" },
  });

  if (!account) {
    return {
      account: null,
      posts: [],
      selectedPost: null,
      selectedPostComments: [],
      dms: [],
      monitorTargets: [],
    };
  }

  const [posts, dms, monitorTargets] = await Promise.all([
    prisma.igPost.findMany({
      where: { channelAccountId: account.id },
      orderBy: { postedAt: "desc" },
      take: 40,
    }),
    prisma.igDm.findMany({
      where: { channelAccountId: account.id },
      orderBy: { lastMessageAt: "desc" },
      take: 20,
    }),
    prisma.igMonitorTarget.findMany({
      where: { channelAccountId: account.id },
      orderBy: { createdAt: "desc" },
      include: {
        posts: {
          orderBy: { postedAt: "desc" },
          take: 9,
        },
      },
    }),
  ]);

  const selectedPost =
    posts.find((p) => p.id === selectedPostId) ??
    (selectedPostId
      ? await prisma.igPost.findUnique({ where: { id: selectedPostId } })
      : null) ??
    posts[0] ??
    null;

  const selectedPostComments = selectedPost
    ? await prisma.igComment.findMany({
        where: { igPostId: selectedPost.id },
        orderBy: { timestamp: "asc" },
      })
    : [];

  return {
    account,
    posts,
    selectedPost,
    selectedPostComments,
    dms,
    monitorTargets,
  };
}

const TABS = [
  { id: "feed", label: "Feed", icon: "🏠" },
  { id: "comments", label: "Comments", icon: "💬" },
  { id: "insights", label: "Insights", icon: "📊" },
  { id: "compose", label: "Compose", icon: "✏️" },
  { id: "dms", label: "DMs", icon: "📩" },
  { id: "monitor", label: "Monitor", icon: "🔍" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function getInitials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "IG";
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export default async function InstagramPage({ searchParams }: PageProps) {
  const { tab, post, connected, error } = await searchParams;
  const activeTab: TabId = (TABS.some((t) => t.id === tab) ? tab : "feed") as TabId;

  const { account, posts, selectedPost, selectedPostComments, dms, monitorTargets } =
    await getIgDashboardData(post);

  // Generate OAuth URL (won't throw even if env vars missing during build)
  let oauthUrl = "#";
  try {
    oauthUrl = getOAuthUrl();
  } catch {
    // env vars not set yet
  }

  const isConnected = account?.status === "CONNECTED";

  return (
    <main className="ig-page">
      {/* Sidebar */}
      <aside className="ig-sidebar">
        <div className="ig-sidebar-top">
          {/* Logo */}
          <div className="ig-sidebar-logo">SM</div>

          {/* Nav */}
          <nav className="ig-sidebar-nav" aria-label="Platform">
            <Link
              href="/"
              className="ig-sidebar-navbtn ig-sidebar-navbtn-inactive"
              aria-label="WhatsApp"
            >
              WA
            </Link>
            <Link
              href="/instagram"
              className="ig-sidebar-navbtn ig-sidebar-navbtn-active"
              aria-label="Instagram"
            >
              <span className="ig-sidebar-ig-icon">IG</span>
            </Link>
          </nav>
        </div>

        {/* Account avatar */}
        <div className="ig-sidebar-avatar">
          {account?.igProfilePicUrl ? (
            <img
              src={account.igProfilePicUrl}
              alt={account.igUsername ?? "IG"}
              className="ig-sidebar-avatar-img"
            />
          ) : (
            <span>{getInitials(account?.displayName ?? "IG")}</span>
          )}
        </div>
      </aside>

      {/* Main content */}
      <section className="ig-main">
        {/* Top bar */}
        <header className="ig-topbar">
          <div className="ig-topbar-left">
            <p className="ig-topbar-label">Instagram</p>
            <h1 className="ig-topbar-title">Social Dashboard</h1>
          </div>
          <div className="ig-topbar-right">
            {/* Connection status pill */}
            <div className={`ig-status-pill ${isConnected ? "ig-status-pill-connected" : "ig-status-pill-disconnected"}`}>
              <span className="ig-status-dot" />
              {isConnected
                ? `@${account?.igUsername ?? account?.displayName}`
                : "Not connected"}
            </div>
          </div>
        </header>

        {/* Flash messages */}
        {connected === "1" && (
          <div className="ig-flash ig-flash-ok">
            ✅ Instagram account connected successfully!
          </div>
        )}
        {error && (
          <div className="ig-flash ig-flash-err">
            ❌ {decodeURIComponent(error)}
          </div>
        )}

        {/* Two-column layout: tabs + connect card on right */}
        <div className="ig-layout">
          {/* Left: tab bar + content */}
          <div className="ig-content-area">
            {/* Tab bar */}
            <nav className="ig-tabs" aria-label="Instagram sections">
              {TABS.map((t) => (
                <Link
                  key={t.id}
                  href={`/instagram?tab=${t.id}${post ? `&post=${post}` : ""}`}
                  className={`ig-tab ${activeTab === t.id ? "ig-tab-active" : ""}`}
                >
                  <span className="ig-tab-icon">{t.icon}</span>
                  <span className="ig-tab-label">{t.label}</span>
                </Link>
              ))}
            </nav>

            {/* Tab content */}
            <div className="ig-tab-content">
              {activeTab === "feed" && (
                <IgFeed
                  posts={posts.map((p) => ({
                    ...p,
                    postedAt: p.postedAt,
                  }))}
                  selectedPostId={selectedPost?.id}
                />
              )}

              {activeTab === "comments" && (
                <IgComments
                  post={selectedPost}
                  comments={selectedPostComments}
                />
              )}

              {activeTab === "insights" && (
                <IgInsights posts={posts} />
              )}

              {activeTab === "compose" && <IgCompose />}

              {activeTab === "dms" && (
                <IgDm
                  threads={dms.map((d) => ({
                    ...d,
                    messages: (d.messages as unknown as {
                      id: string;
                      message: string;
                      from: { id: string; username?: string; name?: string };
                      created_time: string;
                    }[]),
                  }))}
                  myIgId={account?.igUserId ?? null}
                />
              )}

              {activeTab === "monitor" && (
                <IgMonitor targets={monitorTargets} />
              )}
            </div>
          </div>

          {/* Right: connect card */}
          <aside className="ig-right-sidebar">
            <IgConnect
              account={account ? {
                id: account.id,
                igUsername: account.igUsername,
                igProfilePicUrl: account.igProfilePicUrl,
                displayName: account.displayName,
                status: account.status,
                igTokenExpiresAt: account.igTokenExpiresAt,
              } : null}
              oauthUrl={oauthUrl}
            />

            {/* Quick stats */}
            {isConnected && (
              <div className="ig-quick-stats">
                <div className="ig-quick-stat">
                  <span className="ig-quick-stat-value">{posts.length}</span>
                  <span className="ig-quick-stat-label">Posts synced</span>
                </div>
                <div className="ig-quick-stat">
                  <span className="ig-quick-stat-value">{dms.length}</span>
                  <span className="ig-quick-stat-label">DM threads</span>
                </div>
                <div className="ig-quick-stat">
                  <span className="ig-quick-stat-value">{monitorTargets.length}</span>
                  <span className="ig-quick-stat-label">Monitored</span>
                </div>
                <div className="ig-quick-stat">
                  <span className="ig-quick-stat-value">
                    {dms.filter((d) => d.withinWindow).length}
                  </span>
                  <span className="ig-quick-stat-label">DMs open</span>
                </div>
              </div>
            )}

            {/* Webhook setup guide */}
            <div className="ig-webhook-guide">
              <p className="ig-webhook-guide-title">⚡ Webhook Setup</p>
              <div className="ig-webhook-guide-steps">
                <p className="ig-webhook-url">
                  <code>{process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/instagram/webhook</code>
                </p>
                <ol className="ig-webhook-steps">
                  <li>Install ngrok: <code>brew install ngrok</code></li>
                  <li>Run: <code>ngrok http 3000</code></li>
                  <li>Copy the HTTPS URL + add <code>/api/instagram/webhook</code></li>
                  <li>Paste in Facebook Developers → Instagram → Webhooks</li>
                  <li>Subscribe to: <code>comments</code>, <code>mentions</code>, <code>messages</code></li>
                </ol>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
