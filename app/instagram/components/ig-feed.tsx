"use client";

import { syncInstagramPosts } from "../actions";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  IMAGE: "Photo",
  VIDEO: "Video",
  CAROUSEL_ALBUM: "Album",
  REEL: "Reel",
  STORY: "Story",
};

const FILTERS = [
  { id: "all", label: "All" },
  { id: "IMAGE", label: "Photos" },
  { id: "VIDEO", label: "Videos" },
  { id: "CAROUSEL_ALBUM", label: "Albums" },
  { id: "REEL", label: "Reels" },
] as const;

const SORTS = [
  { id: "recent", label: "Newest" },
  { id: "engagement", label: "Most engaged" },
  { id: "comments", label: "Most comments" },
] as const;

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
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [sort, setSort] = useState<(typeof SORTS)[number]["id"]>("recent");

  function handleSync() {
    startTransition(async () => {
      setMsg(null);
      const result = await syncInstagramPosts();
      if ("error" in result) {
        setMsg(`Error: ${result.error}`);
      } else {
        setMsg(`Synced ${result.count} posts`);
        router.refresh();
        setTimeout(() => setMsg(null), 3000);
      }
    });
  }

  const feed = posts.filter((p) => !p.isStory);
  const stories = posts.filter((p) => p.isStory);
  const filteredFeed = feed
    .filter((p) => filter === "all" || p.mediaType === filter)
    .slice()
    .sort((a, b) => {
      if (sort === "engagement") {
        return b.likeCount + b.commentsCount - (a.likeCount + a.commentsCount);
      }
      if (sort === "comments") return b.commentsCount - a.commentsCount;
      return new Date(b.postedAt ?? 0).getTime() - new Date(a.postedAt ?? 0).getTime();
    });
  const totalEngagement = feed.reduce((sum, post) => sum + post.likeCount + post.commentsCount, 0);
  const bestPost = feed.reduce<Post | null>((best, post) => {
    if (!best) return post;
    return post.likeCount + post.commentsCount > best.likeCount + best.commentsCount ? post : best;
  }, null);

  return (
    <div className="ig-feed-root">
      <div className="ig-feed-header">
        <div>
          <h2 className="ig-section-title">Your Feed</h2>
          <p className="ig-section-sub">
            {feed.length} posts · {stories.length} stories · {totalEngagement.toLocaleString()} engagements
          </p>
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

      {feed.length > 0 && (
        <div className="ig-feed-toolbar">
          <div className="ig-segmented" aria-label="Filter posts">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={`ig-segment ${filter === item.id ? "ig-segment-active" : ""}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <label className="ig-select-label">
            Sort
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as typeof sort)}
              className="ig-select"
            >
              {SORTS.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      {bestPost && (
        <div className="ig-feed-callout">
          <span className="ig-callout-kicker">Best performer</span>
          <span className="ig-callout-text">
            {bestPost.caption ? bestPost.caption.slice(0, 90) : "Untitled post"} · {(bestPost.likeCount + bestPost.commentsCount).toLocaleString()} engagements
          </span>
          <Link href={`/instagram?tab=comments&post=${bestPost.id}`} className="ig-inline-link">
            Review comments
          </Link>
        </div>
      )}

      {/* Stories row */}
      {stories.length > 0 && (
        <div className="ig-stories-row">
          {stories.map((story) => (
            <button
              key={story.id}
              type="button"
              onClick={() => {
                onSelectPost?.(story);
                router.push(`/instagram?tab=comments&post=${story.id}`, { scroll: false });
              }}
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
                    <div className="ig-story-placeholder">Story</div>
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
          {filteredFeed.map((post) => {
            const thumb = post.thumbnailUrl ?? post.mediaUrl;
            const isSelected = post.id === selectedPostId;

            return (
              <Link
                key={post.id}
                href={`/instagram?tab=comments&post=${post.id}`}
                onClick={() => onSelectPost?.(post)}
                className={`ig-grid-item ${isSelected ? "ig-grid-item-active" : ""}`}
              >
                {/* Thumbnail */}
                <div className="ig-grid-thumb">
                  {thumb ? (
                    <img src={thumb} alt={post.caption ?? ""} className="ig-grid-img" />
                  ) : (
                    <div className="ig-grid-placeholder">
                      <span>{mediaTypeIcon[post.mediaType] ?? "Post"}</span>
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
                  <span>{post.likeCount.toLocaleString()} likes</span>
                  <span>{post.commentsCount.toLocaleString()} comments</span>
                  {post.reach != null && (
                    <span>{post.reach.toLocaleString()} reach</span>
                  )}
                </div>

                {/* Caption + time */}
                <div className="ig-grid-meta">
                  <p className="ig-grid-caption">
                    {post.caption ? post.caption.slice(0, 60) + (post.caption.length > 60 ? "…" : "") : "No caption"}
                  </p>
                  <p className="ig-grid-time">{formatRelative(post.postedAt)}</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
