"use client";

import { useRef, useState, useTransition } from "react";
import { createBroadcastJob } from "../actions";
import { whatsappSendPolicy } from "@/lib/queue/message-policy";

type Contact = {
  id: string;
  displayName: string;
  phoneNumber: string | null;
  externalId: string;
};

type BroadcastModalProps = {
  contacts: Contact[];
  onClose: () => void;
};

export function BroadcastModal({ contacts, onClose }: BroadcastModalProps) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [body, setBody] = useState("");
  const [delaySeconds, setDelaySeconds] = useState<number>(whatsappSendPolicy.defaultDelaySeconds);
  const [jitterSeconds, setJitterSeconds] = useState<number>(whatsappSendPolicy.defaultJitterSeconds);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  const overlayRef = useRef<HTMLDivElement>(null);

  const filtered = contacts.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.displayName.toLowerCase().includes(q) ||
      (c.phoneNumber ?? "").includes(q)
    );
  });

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((c) => c.id)));
    }
  }

  const estimatedMinutes = Math.ceil((selected.size * delaySeconds) / 60);

  function handleSubmit() {
    setError(null);
    if (!body.trim()) {
      setError("Please enter a message.");
      return;
    }
    if (selected.size === 0) {
      setError("Select at least one contact.");
      return;
    }

    startTransition(async () => {
      const result = await createBroadcastJob(body, Array.from(selected), {
        delaySeconds,
        jitterSeconds,
      });
      if ("error" in result && result.error) {
        setError(result.error);
      } else {
        setSuccess(true);
        setTimeout(onClose, 1500);
      }
    });
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="flex h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-black/10 bg-[#f7faf8] px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-[#15201c]">📢 Broadcast Message</h2>
            <p className="text-xs text-[#667871]">Send to multiple contacts with safe delays</p>
          </div>
          <button
            onClick={onClose}
            className="grid size-9 place-items-center rounded-lg border border-black/10 text-xl text-[#667871] hover:bg-black/5"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
          {/* Message body */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#667871]">
              Message
            </label>
            <textarea
              className="w-full resize-none rounded-lg border border-black/10 bg-[#f7faf8] px-4 py-3 text-sm leading-6 text-[#15201c] placeholder:text-[#667871] focus:outline-none focus:ring-2 focus:ring-[#24d366]"
              rows={4}
              placeholder="Type your broadcast message here…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>

          {/* Delay settings */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-[#667871]">
                <span>Delay between sends</span>
                <span className="font-mono text-[#15201c]">{delaySeconds}s</span>
              </label>
              <input
                type="range"
                min={30}
                max={120}
                step={5}
                value={delaySeconds}
                onChange={(e) => setDelaySeconds(Number(e.target.value))}
                className="w-full accent-[#24d366]"
              />
              <div className="mt-0.5 flex justify-between text-[10px] text-[#667871]">
                <span>30s (min)</span><span>120s</span>
              </div>
            </div>
            <div>
              <label className="mb-1.5 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-[#667871]">
                <span>Random jitter</span>
                <span className="font-mono text-[#15201c]">±{jitterSeconds}s</span>
              </label>
              <input
                type="range"
                min={0}
                max={30}
                step={5}
                value={jitterSeconds}
                onChange={(e) => setJitterSeconds(Number(e.target.value))}
                className="w-full accent-[#24d366]"
              />
              <div className="mt-0.5 flex justify-between text-[10px] text-[#667871]">
                <span>0s</span><span>30s</span>
              </div>
            </div>
          </div>

          {/* Contact list */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wide text-[#667871]">
                Recipients
              </label>
              <button
                onClick={toggleAll}
                className="text-xs font-medium text-[#24d366] hover:underline"
              >
                {selected.size === filtered.length && filtered.length > 0 ? "Deselect all" : "Select all"}
              </button>
            </div>
            <div className="mb-2">
              <input
                type="text"
                placeholder="Search contacts…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-black/10 bg-[#f7faf8] px-3 py-2 text-sm text-[#15201c] placeholder:text-[#667871] focus:outline-none focus:ring-2 focus:ring-[#24d366]"
              />
            </div>
            <div className="flex-1 overflow-y-auto rounded-lg border border-black/10">
              {filtered.length === 0 ? (
                <p className="p-4 text-center text-sm text-[#667871]">No contacts found</p>
              ) : (
                filtered.map((contact) => (
                  <label
                    key={contact.id}
                    className="flex cursor-pointer items-center gap-3 border-b border-black/5 px-4 py-2.5 last:border-0 hover:bg-[#f7faf8]"
                  >
                    <input
                      type="checkbox"
                      className="size-4 accent-[#24d366]"
                      checked={selected.has(contact.id)}
                      onChange={() => toggle(contact.id)}
                    />
                    <div className="grid size-8 shrink-0 place-items-center rounded-full bg-[#d9eee5] text-xs font-bold text-[#183229]">
                      {Array.from(contact.displayName)[0]?.toUpperCase() ?? "?"}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#15201c]">{contact.displayName}</p>
                      <p className="truncate text-xs text-[#667871]">{contact.phoneNumber ? `+${contact.phoneNumber}` : contact.externalId}</p>
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-black/10 bg-[#f7faf8] px-6 py-4">
          {error && (
            <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{error}</p>
          )}
          {success && (
            <p className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-xs font-medium text-green-700">✓ Broadcast queued! Check the queue panel for progress.</p>
          )}
          <div className="flex items-center justify-between gap-4">
            <div className="text-xs text-[#667871]">
              <span className="font-semibold text-[#15201c]">{selected.size}</span> selected
              {selected.size > 0 && (
                <> · ~<span className="font-semibold text-[#15201c]">{estimatedMinutes} min</span> to complete</>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="rounded-lg border border-black/10 bg-white px-4 py-2 text-sm font-medium text-[#15201c] hover:bg-black/5"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={isPending || selected.size === 0 || !body.trim()}
                className="rounded-lg bg-[#24d366] px-5 py-2 text-sm font-bold text-[#10241d] transition hover:bg-[#20bd5c] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? "Queuing…" : `Queue Broadcast (${selected.size})`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
