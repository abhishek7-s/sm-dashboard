"use client";

import { disconnectInstagram, syncInstagramPosts } from "../actions";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Props = {
  account: {
    id: string;
    igUsername: string | null;
    igProfilePicUrl: string | null;
    displayName: string;
    status: string;
    igTokenExpiresAt: Date | null;
  } | null;
  oauthUrl: string;
};

export function IgConnect({ account, oauthUrl }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const isConnected = account?.status === "CONNECTED";

  function daysUntilExpiry(expiresAt: Date | null) {
    if (!expiresAt) return null;
    const diff = new Date(expiresAt).getTime() - now;
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }

  const days = daysUntilExpiry(account?.igTokenExpiresAt ?? null);

  function handleSync() {
    startTransition(async () => {
      setSyncMsg(null);
      const result = await syncInstagramPosts();
      if ("error" in result) {
        setSyncMsg(`Error: ${result.error}`);
      } else {
        setSyncMsg(`Synced ${result.count} posts`);
        router.refresh();
        setTimeout(() => setSyncMsg(null), 3000);
      }
    });
  }

  function handleDisconnect() {
    startTransition(async () => {
      await disconnectInstagram();
      router.refresh();
    });
  }

  return (
    <div className="ig-connect-card">
      {isConnected && account ? (
        <div className="ig-connect-inner">
          <div className="ig-connect-avatar-row">
            {account.igProfilePicUrl ? (
              <img
                src={account.igProfilePicUrl}
                alt={account.igUsername ?? "IG"}
                className="ig-connect-avatar"
              />
            ) : (
              <div className="ig-connect-avatar ig-connect-avatar-fallback">
                {(account.igUsername ?? account.displayName)?.[0]?.toUpperCase() ?? "I"}
              </div>
            )}
            <div className="ig-connect-info">
              <p className="ig-connect-username">@{account.igUsername ?? account.displayName}</p>
              <p className="ig-connect-meta">
                {days !== null ? (
                  days < 7 ? (
                    <span className="ig-token-warn">Token expires in {days}d</span>
                  ) : (
                    <span className="ig-token-ok">Token valid · {days}d left</span>
                  )
                ) : (
                  "Connected"
                )}
              </p>
            </div>
            <span className="ig-status-badge ig-status-connected">CONNECTED</span>
          </div>
          {days !== null && days < 14 && (
            <div className="ig-connect-alert">
              Reconnect soon to keep publishing, comments, and DMs working without interruption.
            </div>
          )}
          <div className="ig-connect-actions">
            <button
              onClick={handleSync}
              disabled={isPending}
              className="ig-btn ig-btn-secondary"
            >
              {isPending ? "Syncing…" : "↻ Sync Posts"}
            </button>
            <button
              onClick={handleDisconnect}
              disabled={isPending}
              className="ig-btn ig-btn-danger"
            >
              Disconnect
            </button>
          </div>
          {syncMsg && <p className="ig-sync-msg">{syncMsg}</p>}
        </div>
      ) : (
        <div className="ig-connect-inner ig-connect-empty">
          <div className="ig-connect-icon">📸</div>
          <p className="ig-connect-title">Connect Instagram</p>
          <p className="ig-connect-desc">
            Link your Instagram Business or Creator account to manage posts,
            comments, DMs, and insights from this dashboard.
          </p>
          <a href={oauthUrl} className="ig-btn ig-btn-primary ig-btn-full">
            Connect via Facebook Login
          </a>
          <p className="ig-connect-note">
            Requires a Business or Creator account linked to a Facebook Page.
          </p>
        </div>
      )}
    </div>
  );
}
