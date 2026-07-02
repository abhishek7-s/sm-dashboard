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
  { id: "feed", label: "Feed", icon: "Grid" },
  { id: "comments", label: "Comments", icon: "Chat" },
  { id: "insights", label: "Insights", icon: "Chart" },
  { id: "compose", label: "Compose", icon: "Post" },
  { id: "dms", label: "DMs", icon: "Inbox" },
  { id: "monitor", label: "Monitor", icon: "Watch" },
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
  const unrepliedComments = selectedPostComments.filter(
    (comment) => !comment.parentCommentId && comment.replyStatus !== "SENT",
  ).length;
  const openDmThreads = dms.filter((d) => d.withinWindow).length;
  const trackedPosts = monitorTargets.reduce((sum, target) => sum + target.posts.length, 0);

  return (
    <main className="ig-page">
      {/* Sidebar */}
      <aside className="hidden w-20 shrink-0 flex-col items-center justify-between bg-slate-900 py-6 shadow-2xl lg:flex relative z-10 border-r border-slate-800">
        <div className="flex flex-col items-center gap-5">
          <div className="grid size-11 place-items-center rounded-lg bg-[#24d366] text-base font-bold text-[#10241d]">
            SM
          </div>
          <nav className="flex flex-col gap-4 mt-8" aria-label="Main">
            <Link
              href="/"
              className="grid size-12 place-items-center rounded-xl text-sm font-semibold transition bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white"
              aria-label="WhatsApp"
            >
              WA
            </Link>
            <button
              className="grid size-12 place-items-center rounded-xl text-sm font-bold transition bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.5)]"
              type="button"
              aria-current="page"
            >
              IG
            </button>
          </nav>
        </div>
        <div className="grid size-10 place-items-center rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 text-sm font-bold text-white shadow-lg overflow-hidden">
          {account?.igProfilePicUrl ? (
            <img
              src={account.igProfilePicUrl}
              alt={account.igUsername ?? "IG"}
              className="size-full object-cover"
            />
          ) : (
            getInitials(account?.displayName ?? "IG")
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
                  posts={posts}
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
                  <span className="ig-quick-stat-value">{unrepliedComments}</span>
                  <span className="ig-quick-stat-label">Need replies</span>
                </div>
                <div className="ig-quick-stat">
                  <span className="ig-quick-stat-value">{openDmThreads}</span>
                  <span className="ig-quick-stat-label">DMs open</span>
                </div>
                <div className="ig-quick-stat">
                  <span className="ig-quick-stat-value">{trackedPosts}</span>
                  <span className="ig-quick-stat-label">Tracked posts</span>
                </div>
              </div>
            )}

            {/* Webhook setup guide */}
            <div className="ig-webhook-guide">
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
