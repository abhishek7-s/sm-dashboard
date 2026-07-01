"use client";

import { syncPostComments, replyToIgComment } from "../actions";
import { useState, useTransition, useRef, useEffect } from "react";

type Comment = {
  id: string;
  externalId: string;
  text: string;
  username: string;
  parentCommentId: string | null;
  replyStatus: string;
  replyText: string | null;
  repliedAt: Date | null;
  hidden: boolean;
  timestamp: Date;
  replies?: Comment[];
};

type Post = {
  id: string;
  externalId: string;
  caption: string | null;
  permalink: string | null;
  commentsCount: number;
  likeCount: number;
  mediaType: string;
  thumbnailUrl: string | null;
  mediaUrl: string | null;
  postedAt: Date | null;
};

type Props = {
  post: Post | null;
  comments: Comment[];
};

function timeAgo(date: Date) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function CommentRow({
  comment,
  onReply,
  depth = 0,
}: {
  comment: Comment;
  onReply: (commentId: string, username: string) => void;
  depth?: number;
}) {
  const hasReplied = comment.replyStatus === "SENT";

  return (
    <div className={`ig-comment-row ${depth > 0 ? "ig-comment-reply" : ""}`}>
      <div className="ig-comment-avatar">
        {comment.username[0]?.toUpperCase() ?? "U"}
      </div>
      <div className="ig-comment-body">
        <div className="ig-comment-header">
          <span className="ig-comment-username">@{comment.username}</span>
          <span className="ig-comment-time">{timeAgo(comment.timestamp)}</span>
          {comment.hidden && <span className="ig-comment-hidden-badge">hidden</span>}
        </div>
        <p className="ig-comment-text">{comment.text}</p>
        <div className="ig-comment-actions">
          <button
            onClick={() => onReply(comment.id, comment.username)}
            className="ig-comment-action-btn"
          >
            Reply
          </button>
          {hasReplied && (
            <span className="ig-comment-replied-badge">✓ Replied</span>
          )}
        </div>
        {comment.replyText && hasReplied && (
          <div className="ig-comment-your-reply">
            <span className="ig-comment-you">You:</span> {comment.replyText}
          </div>
        )}
        {/* Nested replies */}
        {(comment.replies ?? []).map((r) => (
          <CommentRow key={r.id} comment={r} onReply={onReply} depth={depth + 1} />
        ))}
      </div>
    </div>
  );
}

export function IgComments({ post, comments }: Props) {
  const [isPending, startTransition] = useTransition();
  const [replyTarget, setReplyTarget] = useState<{ id: string; username: string } | null>(null);
  const [replyText, setReplyText] = useState("");
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (replyTarget) inputRef.current?.focus();
  }, [replyTarget]);

  if (!post) {
    return (
      <div className="ig-comments-empty">
        <p>Select a post from the feed to view comments.</p>
      </div>
    );
  }

  function handleSetReply(commentId: string, username: string) {
    setReplyTarget({ id: commentId, username });
    setReplyText(`@${username} `);
  }

  function handleSync() {
    startTransition(async () => {
      const result = await syncPostComments(post!.id);
      if ("error" in result) {
        setMsg({ type: "err", text: result.error! });
      } else {
        setMsg({ type: "ok", text: `${result.count} comments loaded` });
        setTimeout(() => setMsg(null), 3000);
      }
    });
  }

  function handleSendReply() {
    if (!replyTarget || !replyText.trim()) return;
    startTransition(async () => {
      const result = await replyToIgComment(replyTarget.id, replyText.trim());
      if ("error" in result) {
        setMsg({ type: "err", text: result.error! });
      } else {
        setMsg({ type: "ok", text: "Reply sent!" });
        setReplyTarget(null);
        setReplyText("");
        setTimeout(() => setMsg(null), 3000);
      }
    });
  }

  // Build tree: separate top-level from replies
  const topLevel = comments.filter((c) => !c.parentCommentId);
  const repliesMap = new Map<string, Comment[]>();
  for (const c of comments.filter((c) => c.parentCommentId)) {
    const list = repliesMap.get(c.parentCommentId!) ?? [];
    list.push(c);
    repliesMap.set(c.parentCommentId!, list);
  }

  const withReplies = topLevel.map((c) => ({
    ...c,
    replies: repliesMap.get(c.id) ?? [],
  }));

  return (
    <div className="ig-comments-root">
      {/* Post header */}
      <div className="ig-comments-post-header">
        <div className="ig-comments-post-thumb">
          {post.thumbnailUrl || post.mediaUrl ? (
            <img src={post.thumbnailUrl ?? post.mediaUrl ?? ""} alt="" className="ig-comments-thumb-img" />
          ) : (
            <div className="ig-comments-thumb-placeholder">🖼️</div>
          )}
        </div>
        <div className="ig-comments-post-info">
          <p className="ig-comments-post-caption">
            {post.caption ? post.caption.slice(0, 80) + (post.caption.length > 80 ? "…" : "") : "No caption"}
          </p>
          <p className="ig-comments-post-stats">
            ❤️ {post.likeCount.toLocaleString()} · 💬 {post.commentsCount.toLocaleString()} comments
          </p>
          {post.permalink && (
            <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="ig-comments-permalink">
              View on Instagram ↗
            </a>
          )}
        </div>
        <button
          onClick={handleSync}
          disabled={isPending}
          className="ig-btn ig-btn-secondary ig-btn-sm"
        >
          {isPending ? "…" : "↻ Load"}
        </button>
      </div>

      {msg && (
        <div className={`ig-comments-msg ${msg.type === "err" ? "ig-comments-msg-err" : "ig-comments-msg-ok"}`}>
          {msg.text}
        </div>
      )}

      {/* Comment list */}
      <div className="ig-comments-list">
        {withReplies.length === 0 ? (
          <div className="ig-comments-none">
            No comments loaded yet. Click Load to fetch from Instagram.
          </div>
        ) : (
          withReplies.map((c) => (
            <CommentRow key={c.id} comment={c} onReply={handleSetReply} />
          ))
        )}
      </div>

      {/* Reply input */}
      <div className="ig-comments-reply-area">
        {replyTarget && (
          <div className="ig-reply-target">
            Replying to <strong>@{replyTarget.username}</strong>
            <button onClick={() => { setReplyTarget(null); setReplyText(""); }} className="ig-reply-cancel">
              ✕
            </button>
          </div>
        )}
        <div className="ig-reply-row">
          <textarea
            ref={inputRef}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Write a reply…"
            rows={2}
            className="ig-reply-input"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSendReply();
              }
            }}
          />
          <button
            onClick={handleSendReply}
            disabled={isPending || !replyTarget || !replyText.trim()}
            className="ig-btn ig-btn-primary"
          >
            {isPending ? "…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
