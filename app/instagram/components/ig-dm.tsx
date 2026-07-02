"use client";

import { syncInstagramDMs, sendInstagramDM } from "../actions";
import { useRouter } from "next/navigation";
import { useState, useTransition, useRef, useLayoutEffect } from "react";

type DmMessage = {
  id: string;
  message: string;
  from: { id: string; username?: string; name?: string };
  created_time: string;
};

type DmThread = {
  id: string;
  externalId: string;
  participantUsername: string | null;
  participantIgId: string | null;
  messages: DmMessage[];
  lastMessageAt: Date | null;
  withinWindow: boolean;
};

type Props = {
  threads: DmThread[];
  myIgId: string | null;
};

function formatTime(dateStr: string) {
  const date = new Date(dateStr);
  const diff = Date.now() - date.getTime();
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

function WindowBadge({ withinWindow }: { withinWindow: boolean }) {
  return (
    <span className={`ig-dm-window-badge ${withinWindow ? "ig-dm-window-open" : "ig-dm-window-closed"}`}>
      {withinWindow ? "✓ 24h window open" : "⏳ Window closed"}
    </span>
  );
}

const DM_FILTERS = [
  { id: "open", label: "Open" },
  { id: "all", label: "All" },
  { id: "closed", label: "Closed" },
] as const;

const QUICK_REPLIES = [
  "Thanks for messaging us. How can we help?",
  "Can you share a few more details so we can check this?",
  "Thanks. We will look into this and get back to you shortly.",
];

export function IgDm({ threads, myIgId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(threads[0]?.id ?? null);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [filter, setFilter] = useState<(typeof DM_FILTERS)[number]["id"]>("open");
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const selected = threads.find((thread) => thread.id === selectedId) ?? threads[0] ?? null;
  const selectedMessages = selected?.messages ?? [];
  const orderedMessages = selectedMessages.slice().reverse();
  const latestMessageId = orderedMessages.at(-1)?.id ?? null;

  useLayoutEffect(() => {
    const messagesEl = messagesRef.current;
    if (!messagesEl) return;

    messagesEl.scrollTop = messagesEl.scrollHeight;
    messagesEndRef.current?.scrollIntoView({ block: "end", behavior: "auto" });
  }, [selected?.id, selectedMessages.length, latestMessageId]);

  function handleSync() {
    startTransition(async () => {
      setMsg(null);
      const result = await syncInstagramDMs();
      if ("error" in result) {
        setMsg({ type: "err", text: result.error! });
      } else {
        setMsg({ type: "ok", text: `${result.count} conversations synced` });
        router.refresh();
        setTimeout(() => setMsg(null), 3000);
      }
    });
  }

  function handleSend() {
    if (!selected?.participantIgId || !text.trim()) return;
    if (!selected.withinWindow) {
      setMsg({ type: "err", text: "The 24-hour messaging window has closed for this conversation." });
      return;
    }

    startTransition(async () => {
      const result = await sendInstagramDM(selected.participantIgId!, text.trim());
      if ("error" in result) {
        setMsg({ type: "err", text: result.error! });
      } else {
        setText("");
        setMsg({ type: "ok", text: "Message sent!" });
        router.refresh();
        setTimeout(() => setMsg(null), 3000);
      }
    });
  }

  const filteredThreads = threads.filter((thread) => {
    if (filter === "open" && !thread.withinWindow) return false;
    if (filter === "closed" && thread.withinWindow) return false;
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return (
      thread.participantUsername?.toLowerCase().includes(needle) ||
      thread.messages.some((message) => message.message?.toLowerCase().includes(needle))
    );
  });
  const openCount = threads.filter((thread) => thread.withinWindow).length;

  return (
    <div className="ig-dm-root">
      {/* Thread list */}
      <div className="ig-dm-sidebar">
        <div className="ig-dm-sidebar-header">
          <div>
            <span className="ig-section-title-sm">Messages</span>
            <p className="ig-dm-sidebar-sub">{openCount} reply windows open</p>
          </div>
          <button
            onClick={handleSync}
            disabled={isPending}
            className="ig-btn ig-btn-ghost ig-btn-sm"
          >
            {isPending ? "…" : "↻"}
          </button>
        </div>
        <div className="ig-dm-tools">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search DMs"
            className="ig-search-input"
          />
          <div className="ig-segmented ig-segmented-full" aria-label="Filter DMs">
            {DM_FILTERS.map((item) => (
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
        </div>

        {threads.length === 0 ? (
          <div className="ig-dm-empty">
            <p>No DM threads yet.</p>
            <button onClick={handleSync} className="ig-btn ig-btn-secondary ig-btn-sm">
              Sync DMs
            </button>
          </div>
        ) : (
          <div className="ig-dm-list">
            {filteredThreads.length === 0 ? (
              <div className="ig-dm-empty-small">No conversations match.</div>
            ) : filteredThreads.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className={`ig-dm-thread ${selected?.id === t.id ? "ig-dm-thread-active" : ""}`}
              >
                <div className="ig-dm-avatar">
                  {(t.participantUsername ?? "?")?.[0]?.toUpperCase()}
                </div>
                <div className="ig-dm-thread-info">
                  <p className="ig-dm-username">
                    {t.participantUsername ? `@${t.participantUsername}` : "Unknown"}
                  </p>
                  <p className="ig-dm-preview">
                    {(t.messages?.[0] as DmMessage)?.message?.slice(0, 40) ?? "No messages"}
                  </p>
                </div>
                <div className="ig-dm-thread-meta">
                  {t.lastMessageAt && (
                    <span className="ig-dm-time">
                      {formatTime(t.lastMessageAt.toString())}
                    </span>
                  )}
                  <span className={`ig-dm-dot ${t.withinWindow ? "ig-dm-dot-open" : "ig-dm-dot-closed"}`} />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Message view */}
      <div className="ig-dm-main">
        {!selected ? (
          <div className="ig-dm-no-select">Select a conversation</div>
        ) : (
          <>
            {/* Header */}
            <div className="ig-dm-main-header">
              <div className="ig-dm-avatar ig-dm-avatar-lg">
                {(selected.participantUsername ?? "?")?.[0]?.toUpperCase()}
              </div>
              <div>
                <p className="ig-dm-main-username">
                  {selected.participantUsername ? `@${selected.participantUsername}` : "Unknown user"}
                </p>
                <WindowBadge withinWindow={selected.withinWindow} />
              </div>
            </div>

            {msg && (
              <div className={`ig-dm-msg ${msg.type === "err" ? "ig-dm-msg-err" : "ig-dm-msg-ok"}`}>
                {msg.text}
              </div>
            )}

            {/* Messages */}
            <div className="ig-dm-messages" ref={messagesRef}>
              {selectedMessages.length === 0 ? (
                <div className="ig-dm-no-messages">No messages loaded yet. Click ↻ to sync.</div>
              ) : (
                orderedMessages
                  .map((m: DmMessage) => {
                    const isMe = m.from.id === myIgId;
                    return (
                      <div
                        key={m.id}
                        className={`ig-dm-bubble-wrap ${isMe ? "ig-dm-bubble-out" : "ig-dm-bubble-in"}`}
                      >
                        <div className={`ig-dm-bubble ${isMe ? "ig-dm-bubble-me" : "ig-dm-bubble-them"}`}>
                          <p>{m.message}</p>
                          <span className="ig-dm-bubble-time">{formatTime(m.created_time)}</span>
                        </div>
                      </div>
                    );
                  })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="ig-dm-input-area">
              {!selected.withinWindow && (
                <div className="ig-dm-window-warning">
                  The 24-hour window is closed. You can only reply to messages received within the last 24 hours.
                </div>
              )}
              {selected.withinWindow && (
                <div className="ig-quick-replies">
                  {QUICK_REPLIES.map((reply) => (
                    <button
                      key={reply}
                      type="button"
                      onClick={() => setText(reply)}
                      className="ig-quick-reply"
                    >
                      {reply}
                    </button>
                  ))}
                </div>
              )}
              <div className="ig-dm-input-row">
                <textarea
                  ref={inputRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={selected.withinWindow ? "Type a message…" : "Window closed — cannot send"}
                  disabled={!selected.withinWindow || isPending}
                  rows={2}
                  className="ig-dm-input"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                />
                <button
                  onClick={handleSend}
                  disabled={!selected.withinWindow || isPending || !text.trim()}
                  className="ig-btn ig-btn-primary"
                >
                  {isPending ? "…" : "Send"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
