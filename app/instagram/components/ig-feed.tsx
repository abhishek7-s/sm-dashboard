"use client";

import { syncInstagramPosts } from "../actions";
import { useState, useTransition } from "react";

type Post = {
  id: string;
  externalId: string;
  mediaType: string;
  caption: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  mediaUrl: string | null;
  likeCount: number;
  commentsCount: number;
  reach: number | null;
  impressions: number | null;
  isStory: boolean;
  postedAt: Date | null;
};

type Props = {
  posts: Post[];
  onSelectPost?: (post: Post) => void;
  selectedPostId?: string;
};

const mediaTypeIcon: Record<string, string> = {
  IMAGE: "🖼️",
  VIDEO: "🎬",
  CAROUSEL_ALBUM: "🎠",
  REEL: "🎞️",
  STORY: "⭕",
};

function formatRelative(date: Date | null) {
  if (!date) return "";
  const diff = Date.now() - new Date(date).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function IgFeed({ posts, onSelectPost, selectedPostId }: Props) {
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function handleSync() {
    startTransition(async () => {
      setMsg(null);
      const result = await syncInstagramPosts();
      if ("error" in result) {
        setMsg(`Error: ${result.error}`);
      } else {
        setMsg(`Synced ${result.count} posts`);
        setTimeout(() => setMsg(null), 3000);
      }
    });
  }

  const feed = posts.filter((p) => !p.isStory);
  const stories = posts.filter((p) => p.isStory);

  return (
    <div className="ig-feed-root">
      <div className="ig-feed-header">
        <div>
          <h2 className="ig-section-title">Your Feed</h2>
          <p className="ig-section-sub">{feed.length} posts · {stories.length} stories</p>
        </div>
        <button
          onClick={handleSync}
          disabled={isPending}
          className="ig-btn ig-btn-secondary ig-btn-sm"
        >
          {isPending ? "…" : "↻ Refresh"}
        </button>
      </div>

      {msg && <p className="ig-feed-msg">{msg}</p>}

      {/* Stories row */}
      {stories.length > 0 && (
        <div className="ig-stories-row">
          {stories.map((story) => (
            <button
              key={story.id}
              onClick={() => onSelectPost?.(story)}
              className={`ig-story-bubble ${selectedPostId === story.id ? "ig-story-active" : ""}`}
            >
              <div className="ig-story-ring">
                {story.thumbnailUrl || story.mediaUrl ? (
                  <img
                    src={story.thumbnailUrl ?? story.mediaUrl ?? ""}
                    alt="Story"
                    className="ig-story-img"
                  />
                ) : (
                  <div className="ig-story-placeholder">⭕</div>
                )}
              </div>
              <span className="ig-story-label">Story</span>
            </button>
          ))}
        </div>
      )}

      {/* Main grid */}
      {feed.length === 0 ? (
        <div className="ig-feed-empty">
          <p>No posts synced yet.</p>
          <button onClick={handleSync} className="ig-btn ig-btn-primary ig-btn-sm">
            Sync Now
          </button>
        </div>
      ) : (
        <div className="ig-grid">
          {feed.map((post) => {
            const thumb = post.thumbnailUrl ?? post.mediaUrl;
            const isSelected = post.id === selectedPostId;

            return (
              <button
                key={post.id}
                onClick={() => onSelectPost?.(post)}
                className={`ig-grid-item ${isSelected ? "ig-grid-item-active" : ""}`}
              >
                {/* Thumbnail */}
                <div className="ig-grid-thumb">
                  {thumb ? (
                    <img src={thumb} alt={post.caption ?? ""} className="ig-grid-img" />
                  ) : (
                    <div className="ig-grid-placeholder">
                      <span>{mediaTypeIcon[post.mediaType] ?? "🖼️"}</span>
                    </div>
                  )}
                  <div className="ig-grid-overlay">
                    <span className="ig-grid-type-badge">
                      {mediaTypeIcon[post.mediaType]}
                    </span>
                  </div>
                </div>

                {/* Stats */}
                <div className="ig-grid-stats">
                  <span>❤️ {post.likeCount.toLocaleString()}</span>
                  <span>💬 {post.commentsCount.toLocaleString()}</span>
                  {post.reach != null && (
                    <span>👁️ {post.reach.toLocaleString()}</span>
                  )}
                </div>

                {/* Caption + time */}
                <div className="ig-grid-meta">
                  <p className="ig-grid-caption">
                    {post.caption ? post.caption.slice(0, 60) + (post.caption.length > 60 ? "…" : "") : "No caption"}
                  </p>
                  <p className="ig-grid-time">{formatRelative(post.postedAt)}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
