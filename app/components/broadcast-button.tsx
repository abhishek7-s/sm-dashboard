"use client";

import { useState } from "react";
import { BroadcastModal } from "./broadcast-modal";

type Contact = {
  id: string;
  displayName: string;
  phoneNumber: string | null;
  externalId: string;
};

export function BroadcastButton({ contacts }: { contacts: Contact[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 px-5 py-2 text-sm font-bold text-white shadow-md shadow-emerald-500/20 transition hover:opacity-90"
        type="button"
      >
        📢 Broadcast
      </button>
      {open && (
        <BroadcastModal contacts={contacts} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
