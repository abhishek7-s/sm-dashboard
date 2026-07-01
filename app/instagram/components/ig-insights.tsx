"use client";

import { syncAllInsights, syncPostInsights } from "../actions";
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
  IMAGE: "🖼️",
  VIDEO: "🎬",
  CAROUSEL_ALBUM: "🎠",
  REEL: "🎞️",
  STORY: "⭕",
};

export function IgInsights({ posts }: Props) {
  const [isPending, startTransition] = useTransition();
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

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

  function handleSyncAll() {
    startTransition(async () => {
      setMsg(null);
      const result = await syncAllInsights();
      if ("error" in result) {
        setMsg(`Error: ${result.error}`);
      } else {
        setMsg(`Insights synced (${result.total} posts)`);
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

      {/* Summary cards */}
      <div className="ig-stat-grid">
        <StatCard label="Total Likes" value={totalLikes} icon="❤️" color="pink" />
        <StatCard label="Comments" value={totalComments} icon="💬" color="purple" />
        <StatCard label="Total Reach" value={totalReach || null} icon="📡" color="blue" />
        <StatCard label="Impressions" value={totalImpressions || null} icon="👁️" color="teal" />
        <StatCard label="Saved" value={totalSaved || null} icon="🔖" color="amber" />
        <StatCard label="Posts" value={posts.length} icon="🗂️" color="gray" />
      </div>

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
            {posts.map((post) => {
              const thumb = post.thumbnailUrl ?? post.mediaUrl;
              return (
                <tr key={post.id} className="ig-insights-row">
                  <td>
                    <div className="ig-insights-post-cell">
                      {thumb ? (
                        <img src={thumb} alt="" className="ig-insights-thumb" />
                      ) : (
                        <div className="ig-insights-thumb-placeholder">
                          {mediaTypeIcon[post.mediaType] ?? "🖼️"}
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
