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
        className="rounded-lg bg-[#183229] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#244a3d]"
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
