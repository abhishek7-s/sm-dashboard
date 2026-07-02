"use client";

import { addMonitorTarget, removeMonitorTarget, toggleMonitorTarget, syncMonitorTargets } from "../actions";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type MonitorPost = {
  id: string;
  externalId: string;
  caption: string | null;
  permalink: string | null;
  mediaType: string;
  thumbnailUrl: string | null;
  mediaUrl: string | null;
  likeCount: number;
  commentsCount: number;
  postedAt: Date | null;
};

type MonitorTarget = {
  id: string;
  username: string;
  displayName: string | null;
  profilePicUrl: string | null;
  igBusinessId: string | null;
  enabled: boolean;
  lastCheckedAt: Date | null;
  posts: MonitorPost[];
};

type Props = {
  targets: MonitorTarget[];
};

const mediaTypeIcon: Record<string, string> = {
  IMAGE: "Photo",
  VIDEO: "Video",
  CAROUSEL_ALBUM: "Album",
  REEL: "Reel",
  STORY: "Story",
};

function formatRelative(date: Date | null) {
  if (!date) return "Never";
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function IgMonitor({ targets }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [username, setUsername] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [query, setQuery] = useState("");

  function handleAdd() {
    const clean = username.trim().replace(/^@/, "");
    if (!clean) return;

    startTransition(async () => {
      setMsg(null);
      const result = await addMonitorTarget(clean);
      if ("error" in result) {
        setMsg({ type: "err", text: result.error! });
      } else {
        setMsg({ type: "ok", text: `@${clean} added to monitoring` });
        setUsername("");
        router.refresh();
        setTimeout(() => setMsg(null), 4000);
      }
    });
  }

  function handleRemove(targetId: string) {
    startTransition(async () => {
      await removeMonitorTarget(targetId);
      router.refresh();
    });
  }

  function handleToggle(targetId: string, enabled: boolean) {
    startTransition(async () => {
      await toggleMonitorTarget(targetId, enabled);
      router.refresh();
    });
  }

  function handleSyncAll() {
    startTransition(async () => {
      setMsg(null);
      const result = await syncMonitorTargets();
      if ("error" in result) {
        setMsg({ type: "err", text: result.error! });
      } else {
        setMsg({ type: "ok", text: `Sync complete · ${result.newPosts} new posts found` });
        router.refresh();
        setTimeout(() => setMsg(null), 4000);
      }
    });
  }

  const filteredTargets = targets.filter((target) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return (
      target.username.toLowerCase().includes(needle) ||
      target.displayName?.toLowerCase().includes(needle)
    );
  });
  const activeTargets = targets.filter((target) => target.enabled).length;
  const trackedPosts = targets.reduce((sum, target) => sum + target.posts.length, 0);

  return (
    <div className="ig-monitor-root">
      <div className="ig-monitor-header">
        <div>
          <h2 className="ig-section-title">Account Monitor</h2>
          <p className="ig-section-sub">
            {activeTargets} active accounts · {trackedPosts} tracked posts
          </p>
        </div>
        {targets.length > 0 && (
          <button
            onClick={handleSyncAll}
            disabled={isPending}
            className="ig-btn ig-btn-secondary ig-btn-sm"
          >
            {isPending ? "Syncing…" : "↻ Sync All"}
          </button>
        )}
      </div>

      {/* Add target */}
      <div className="ig-monitor-add">
        <div className="ig-monitor-input-row">
          <span className="ig-monitor-at">@</span>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="instagram_username"
            className="ig-monitor-input"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
          />
          <button
            onClick={handleAdd}
            disabled={isPending || !username.trim()}
            className="ig-btn ig-btn-primary"
          >
            {isPending ? "Adding…" : "Add"}
          </button>
        </div>
        <p className="ig-monitor-hint">
          Only works with Business or Creator accounts (requires Business Discovery API access).
        </p>
      </div>

      {targets.length > 0 && (
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search monitored accounts"
          className="ig-search-input"
        />
      )}

      {msg && (
        <div className={`ig-monitor-msg ${msg.type === "err" ? "ig-monitor-msg-err" : "ig-monitor-msg-ok"}`}>
          {msg.text}
        </div>
      )}

      {/* Target list */}
      {targets.length === 0 ? (
        <div className="ig-monitor-empty">
          <p>No accounts monitored yet. Add a username above to start.</p>
        </div>
      ) : filteredTargets.length === 0 ? (
        <div className="ig-monitor-empty">
          <p>No monitored accounts match your search.</p>
        </div>
      ) : (
        <div className="ig-monitor-list">
          {filteredTargets.map((target) => (
            <div key={target.id} className={`ig-monitor-card ${!target.enabled ? "ig-monitor-card-disabled" : ""}`}>
              {/* Card header */}
              <div className="ig-monitor-card-header">
                <div className="ig-monitor-target-info">
                  {target.profilePicUrl ? (
                    <img src={target.profilePicUrl} alt={target.username} className="ig-monitor-pic" />
                  ) : (
                    <div className="ig-monitor-pic ig-monitor-pic-fallback">
                      {target.username[0]?.toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="ig-monitor-username">@{target.username}</p>
                    {target.displayName && (
                      <p className="ig-monitor-display">{target.displayName}</p>
                    )}
                    <p className="ig-monitor-checked">
                      Last checked: {formatRelative(target.lastCheckedAt)}
                    </p>
                  </div>
                </div>
                <div className="ig-monitor-controls">
                  <button
                    onClick={() => handleToggle(target.id, !target.enabled)}
                    disabled={isPending}
                    className={`ig-toggle ${target.enabled ? "ig-toggle-on" : "ig-toggle-off"}`}
                    aria-label={target.enabled ? "Disable monitoring" : "Enable monitoring"}
                  >
                    {target.enabled ? "ON" : "OFF"}
                  </button>
                  <button
                    onClick={() => setExpanded(expanded === target.id ? null : target.id)}
                    className="ig-btn ig-btn-ghost ig-btn-sm"
                  >
                    {expanded === target.id ? "Hide" : `Posts (${target.posts.length})`}
                  </button>
                  <button
                    onClick={() => handleRemove(target.id)}
                    disabled={isPending}
                    className="ig-btn ig-btn-danger ig-btn-sm"
                  >
                    Remove
                  </button>
                </div>
              </div>

              {/* Latest posts */}
              {expanded === target.id && (
                <div className="ig-monitor-posts">
                  {target.posts.length === 0 ? (
                    <p className="ig-monitor-no-posts">No posts seen yet. Click Sync All to fetch.</p>
                  ) : (
                    <div className="ig-monitor-posts-grid">
                      {target.posts.slice(0, 9).map((post) => {
                        const thumb = post.thumbnailUrl ?? post.mediaUrl;
                        return (
                          <a
                            key={post.id}
                            href={post.permalink ?? "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ig-monitor-post-item"
                          >
                            {thumb ? (
                              <img src={thumb} alt={post.caption ?? ""} className="ig-monitor-post-img" />
                            ) : (
                              <div className="ig-monitor-post-placeholder">
                                {mediaTypeIcon[post.mediaType] ?? "Post"}
                              </div>
                            )}
                            <div className="ig-monitor-post-overlay">
                              <span>{post.likeCount.toLocaleString()} likes</span>
                              <span>{post.commentsCount.toLocaleString()} comments</span>
                            </div>
                          </a>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
