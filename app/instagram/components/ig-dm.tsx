"use client";

import { syncInstagramDMs, sendInstagramDM } from "../actions";
import { useState, useTransition, useRef, useEffect } from "react";

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

export function IgDm({ threads, myIgId }: Props) {
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<DmThread | null>(threads[0] ?? null);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selected?.id]);

  function handleSync() {
    startTransition(async () => {
      setMsg(null);
      const result = await syncInstagramDMs();
      if ("error" in result) {
        setMsg({ type: "err", text: result.error! });
      } else {
        setMsg({ type: "ok", text: `${result.count} conversations synced` });
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
        setTimeout(() => setMsg(null), 3000);
      }
    });
  }

  const selectedMessages = selected?.messages ?? [];

  return (
    <div className="ig-dm-root">
      {/* Thread list */}
      <div className="ig-dm-sidebar">
        <div className="ig-dm-sidebar-header">
          <span className="ig-section-title-sm">Messages</span>
          <button
            onClick={handleSync}
            disabled={isPending}
            className="ig-btn ig-btn-ghost ig-btn-sm"
          >
            {isPending ? "…" : "↻"}
          </button>
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
            {threads.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelected(t)}
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
            <div className="ig-dm-messages">
              {selectedMessages.length === 0 ? (
                <div className="ig-dm-no-messages">No messages loaded yet. Click ↻ to sync.</div>
              ) : (
                selectedMessages
                  .slice()
                  .reverse()
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
                  ⚠️ The 24-hour window is closed. You can only reply to messages received within the last 24 hours.
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
