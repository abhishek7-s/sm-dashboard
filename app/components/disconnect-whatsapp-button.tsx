"use client";

import { useState, useTransition } from "react";
import { disconnectWhatsApp } from "../actions";

/** Two-step button so a stray click can't unlink the phone. */
export function DisconnectWhatsAppButton({ pending }: { pending?: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (pending || isPending) {
    return <p className="text-xs font-medium text-slate-500">Unlinking… a new QR code will appear shortly.</p>;
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:underline"
      >
        Unlink this phone
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
      <p className="text-xs text-rose-800">
        This logs the dashboard out of WhatsApp. You&apos;ll need to scan a new QR code to use it again.
      </p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => startTransition(async () => { await disconnectWhatsApp(); })}
          className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700"
        >
          Yes, unlink
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
