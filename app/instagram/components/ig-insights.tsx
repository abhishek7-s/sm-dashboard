"use client";

import { syncAllInsights, syncPostInsights } from "../actions";
import { useRouter } from "next/navigation";
import { useTransition, useState } from "react";

type Post = {
  id: string;
  externalId: string;
  caption: string | null;
  mediaType: string;
  thumbnailUrl: string | null;
  mediaUrl: string | null;
  likeCount: number;
  commentsCount: number;
  reach: number | null;
  impressions: number | null;
  saved: number | null;
  postedAt: Date | null;
};

type Props = {
  posts: Post[];
};

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number | null;
  icon: string;
  color: string;
}) {
  return (
    <div className={`ig-stat-card ig-stat-${color}`}>
      <div className="ig-stat-icon">{icon}</div>
      <div className="ig-stat-value">
        {value != null ? value.toLocaleString() : "—"}
      </div>
      <div className="ig-stat-label">{label}</div>
    </div>
  );
}

function formatDate(date: Date | null) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(
    new Date(date),
  );
}

const mediaTypeIcon: Record<string, string> = {
  IMAGE: "Photo",
  VIDEO: "Video",
  CAROUSEL_ALBUM: "Album",
  REEL: "Reel",
  STORY: "Story",
};

const INSIGHT_SORTS = [
  { id: "reach", label: "Reach" },
  { id: "engagement", label: "Engagement" },
  { id: "comments", label: "Comments" },
  { id: "recent", label: "Newest" },
] as const;

export function IgInsights({ posts }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [sort, setSort] = useState<(typeof INSIGHT_SORTS)[number]["id"]>("reach");

  // Aggregate totals across all posts
  const totalLikes = posts.reduce((s, p) => s + p.likeCount, 0);
  const totalComments = posts.reduce((s, p) => s + p.commentsCount, 0);
  const totalReach = posts
    .filter((p) => p.reach != null)
    .reduce((s, p) => s + (p.reach ?? 0), 0);
  const totalImpressions = posts
    .filter((p) => p.impressions != null)
    .reduce((s, p) => s + (p.impressions ?? 0), 0);
  const totalSaved = posts
    .filter((p) => p.saved != null)
    .reduce((s, p) => s + (p.saved ?? 0), 0);
  const engagement = totalLikes + totalComments + totalSaved;
  const avgReach = posts.length > 0 ? Math.round(totalReach / posts.length) : null;
  const insightCoverage = posts.length
    ? Math.round((posts.filter((p) => p.reach != null || p.impressions != null).length / posts.length) * 100)
    : 0;
  const sortedPosts = posts.slice().sort((a, b) => {
    if (sort === "engagement") {
      return b.likeCount + b.commentsCount + (b.saved ?? 0) - (a.likeCount + a.commentsCount + (a.saved ?? 0));
    }
    if (sort === "comments") return b.commentsCount - a.commentsCount;
    if (sort === "recent") return new Date(b.postedAt ?? 0).getTime() - new Date(a.postedAt ?? 0).getTime();
    return (b.reach ?? 0) - (a.reach ?? 0);
  });
  const topPost = sortedPosts[0] ?? null;

  function handleSyncAll() {
    startTransition(async () => {
      setMsg(null);
      const result = await syncAllInsights();
      if ("error" in result) {
        setMsg(`Error: ${result.error}`);
      } else {
        setMsg(`Insights synced (${result.total} posts)`);
        router.refresh();
        setTimeout(() => setMsg(null), 3000);
      }
    });
  }

  function handleSyncOne(postId: string) {
    setSyncingId(postId);
    startTransition(async () => {
      const result = await syncPostInsights(postId);
      setSyncingId(null);
      if ("error" in result) {
        setMsg(`Error: ${result.error}`);
      } else {
        router.refresh();
        setTimeout(() => setMsg(null), 3000);
      }
    });
  }

  return (
    <div className="ig-insights-root">
      <div className="ig-insights-header">
        <div>
          <h2 className="ig-section-title">Insights</h2>
          <p className="ig-section-sub">Aggregated across {posts.length} posts</p>
        </div>
        <button
          onClick={handleSyncAll}
          disabled={isPending}
          className="ig-btn ig-btn-secondary ig-btn-sm"
        >
          {isPending ? "Syncing…" : "↻ Sync All"}
        </button>
      </div>

      {msg && <p className="ig-insights-msg">{msg}</p>}

      <div className="ig-insights-toolbar">
        <div>
          <span className="ig-callout-kicker">Insight coverage</span>
          <p className="ig-insights-coverage">
            {insightCoverage}% of synced posts have reach or impression data · {totalImpressions.toLocaleString()} impressions
          </p>
        </div>
        <label className="ig-select-label">
          Rank by
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as typeof sort)}
            className="ig-select"
          >
            {INSIGHT_SORTS.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Summary cards */}
      <div className="ig-stat-grid">
        <StatCard label="Engagement" value={engagement} icon="Eng" color="pink" />
        <StatCard label="Total Reach" value={totalReach || null} icon="Reach" color="blue" />
        <StatCard label="Avg Reach" value={avgReach} icon="Avg" color="teal" />
        <StatCard label="Comments" value={totalComments} icon="Com" color="purple" />
        <StatCard label="Saved" value={totalSaved || null} icon="Save" color="amber" />
        <StatCard label="Posts" value={posts.length} icon="Post" color="gray" />
      </div>

      {topPost && (
        <div className="ig-insights-highlight">
          <span className="ig-callout-kicker">Top ranked post</span>
          <p>{topPost.caption ? topPost.caption.slice(0, 140) : "No caption"}</p>
          <div className="ig-insights-highlight-metrics">
            <span>{topPost.reach?.toLocaleString() ?? "No"} reach</span>
            <span>{(topPost.likeCount + topPost.commentsCount + (topPost.saved ?? 0)).toLocaleString()} engagement</span>
            <span>{formatDate(topPost.postedAt)}</span>
          </div>
        </div>
      )}

      {/* Per-post breakdown */}
      <div className="ig-insights-table-wrap">
        <table className="ig-insights-table">
          <thead>
            <tr>
              <th>Post</th>
              <th>Date</th>
              <th>Likes</th>
              <th>Comments</th>
              <th>Reach</th>
              <th>Impressions</th>
              <th>Saved</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sortedPosts.map((post) => {
              const thumb = post.thumbnailUrl ?? post.mediaUrl;
              return (
                <tr key={post.id} className="ig-insights-row">
                  <td>
                    <div className="ig-insights-post-cell">
                      {thumb ? (
                        <img src={thumb} alt="" className="ig-insights-thumb" />
                      ) : (
                        <div className="ig-insights-thumb-placeholder">
                          {mediaTypeIcon[post.mediaType] ?? "Post"}
                        </div>
                      )}
                      <span className="ig-insights-caption">
                        {post.caption
                          ? post.caption.slice(0, 40) + (post.caption.length > 40 ? "…" : "")
                          : "No caption"}
                      </span>
                    </div>
                  </td>
                  <td className="ig-insights-date">{formatDate(post.postedAt)}</td>
                  <td>{post.likeCount.toLocaleString()}</td>
                  <td>{post.commentsCount.toLocaleString()}</td>
                  <td>{post.reach?.toLocaleString() ?? "—"}</td>
                  <td>{post.impressions?.toLocaleString() ?? "—"}</td>
                  <td>{post.saved?.toLocaleString() ?? "—"}</td>
                  <td>
                    <button
                      onClick={() => handleSyncOne(post.id)}
                      disabled={isPending || syncingId === post.id}
                      className="ig-btn ig-btn-ghost ig-btn-xs"
                    >
                      {syncingId === post.id ? "…" : "↻"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
