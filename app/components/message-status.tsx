"use client";

import { useState, useTransition } from "react";
import { retryChatMessage } from "../actions";

type MessageStatusProps = {
  messageId: string;
  status: string;
  failureReason?: string | null;
};

/** Delivery state for an outgoing message, with a retry button when it failed. */
export function MessageStatus({ messageId, status, failureReason }: MessageStatusProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (status === "FAILED") {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-bold text-white" title={failureReason ?? undefined}>
        {error ?? "Not sent"}
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const result = await retryChatMessage(messageId);
              setError(result && "error" in result ? result.error ?? null : null);
            })
          }
          className="underline underline-offset-2 hover:no-underline disabled:opacity-60"
        >
          {isPending ? "Retrying…" : "Retry"}
        </button>
      </span>
    );
  }

  if (status === "PENDING" || status === "QUEUED") {
    return <span title="Sending">🕓 Sending…</span>;
  }

  if (status === "READ") {
    return <span className="font-bold text-sky-200" title="Read">✓✓</span>;
  }

  if (status === "DELIVERED") {
    return <span title="Delivered">✓✓</span>;
  }

  return <span title="Sent">✓</span>;
}
