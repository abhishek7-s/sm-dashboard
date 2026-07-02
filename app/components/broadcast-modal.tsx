"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, useState, useTransition } from "react";
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
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [body, setBody] = useState("");
  const [delaySeconds, setDelaySeconds] = useState<number>(whatsappSendPolicy.defaultDelaySeconds);
  const [jitterSeconds, setJitterSeconds] = useState<number>(whatsappSendPolicy.defaultJitterSeconds);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  const overlayRef = useRef<HTMLDivElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Prevent background scrolling when modal is open
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, []);

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

  async function handleSubmit() {
    setError(null);
    if (!body.trim() && !file) {
      setError("Please enter a message or attach a file.");
      return;
    }
    if (selected.size === 0) {
      setError("Select at least one contact.");
      return;
    }

    let mediaUrl: string | undefined;
    let mediaMimeType: string | undefined;

    if (file) {
      setIsUploading(true);
      try {
        const uploadData = new FormData();
        uploadData.append("file", file);
        const res = await fetch("/api/upload", {
          method: "POST",
          body: uploadData,
        });
        const result = await res.json();
        if (result.success) {
          mediaUrl = result.mediaUrl;
          mediaMimeType = result.mediaMimeType;
        } else {
          throw new Error(result.error);
        }
      } catch (err) {
        setError("Failed to upload file");
        setIsUploading(false);
        return;
      }
      setIsUploading(false);
    }

    startTransition(async () => {
      const result = await createBroadcastJob(body, Array.from(selected), {
        delaySeconds,
        jitterSeconds,
        mediaUrl,
        mediaMimeType
      });
      if (result?.error) {
        setError(result.error);
      } else {
        setSuccess(true);
        setTimeout(onClose, 1500);
      }
    });
  }

  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-900/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="flex min-h-full items-center justify-center p-4 md:p-8 pointer-events-none">
        <div 
          className="flex w-full max-w-2xl flex-col rounded-2xl bg-slate-50 shadow-2xl border border-slate-200/50 pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-5 shadow-sm relative z-10 rounded-t-2xl">
            <div>
              <h2 className="text-lg font-bold text-slate-800 tracking-tight">📢 Broadcast Message</h2>
              <p className="text-xs font-medium text-slate-500 mt-0.5">Send to multiple contacts with safe delays</p>
            </div>
            <button
              onClick={onClose}
              className="grid size-9 place-items-center rounded-full bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <div className="flex flex-col gap-6 p-6 bg-slate-50">
            {/* Message body */}
            <div className="rounded-xl bg-white p-5 shadow-sm border border-slate-200">
              <label className="mb-3 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Message Content
              </label>
              <textarea
                className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition shadow-inner"
                rows={4}
                placeholder="Type your broadcast message here…"
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
              
              {/* Attachment */}
              <div className="mt-4 flex flex-col gap-3">
                {file ? (
                  <div className="flex items-center justify-between rounded-xl bg-emerald-50 border border-emerald-100 p-3 shadow-sm">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-white text-emerald-600 shadow-sm text-lg">
                        {file.type.includes("image") ? "📷" : file.type.includes("video") ? "🎥" : "📄"}
                      </div>
                      <p className="truncate text-sm font-bold text-emerald-900">{file.name}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFile(null)}
                      className="grid size-8 shrink-0 place-items-center rounded-full text-emerald-600/50 hover:bg-emerald-200 hover:text-emerald-700 transition"
                    >
                      ✕
                    </button>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-500 hover:border-emerald-400 hover:text-emerald-600 hover:bg-emerald-50 transition justify-center"
                >
                  📎 Attach Media or Document
                </button>
                <input
                  type="file"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setFile(e.target.files[0]);
                    }
                  }}
                />
              </div>
            </div>

            {/* Settings & Contacts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Delay settings */}
              <div className="flex flex-col gap-5 rounded-xl bg-white p-5 shadow-sm border border-slate-200">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Sending Speed
                </label>
                <div>
                  <label className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-600">
                    <span>Delay between sends</span>
                    <span className="font-mono font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">{delaySeconds}s</span>
                  </label>
                  <input
                    type="range"
                    min={30}
                    max={120}
                    step={5}
                    value={delaySeconds}
                    onChange={(e) => setDelaySeconds(Number(e.target.value))}
                    className="w-full accent-emerald-500"
                  />
                  <div className="mt-1 flex justify-between text-[10px] font-medium text-slate-400">
                    <span>30s (min)</span><span>120s</span>
                  </div>
                </div>
                <div>
                  <label className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-600">
                    <span>Random jitter</span>
                    <span className="font-mono font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">±{jitterSeconds}s</span>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={30}
                    step={5}
                    value={jitterSeconds}
                    onChange={(e) => setJitterSeconds(Number(e.target.value))}
                    className="w-full accent-emerald-500"
                  />
                  <div className="mt-1 flex justify-between text-[10px] font-medium text-slate-400">
                    <span>0s</span><span>30s</span>
                  </div>
                </div>
              </div>

              {/* Contact list */}
              <div className="flex flex-col rounded-xl bg-white p-5 shadow-sm border border-slate-200">
                <div className="mb-3 flex items-center justify-between">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Recipients ({selected.size})
                  </label>
                  <button
                    onClick={toggleAll}
                    className="text-[11px] font-bold text-emerald-500 hover:text-emerald-600 uppercase tracking-wider"
                  >
                    {selected.size === filtered.length && filtered.length > 0 ? "Deselect all" : "Select all"}
                  </button>
                </div>
                <div className="mb-3">
                  <input
                    type="text"
                    placeholder="Search contacts…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 shadow-inner"
                  />
                </div>
                <div className="h-[240px] overflow-y-auto rounded-lg border border-slate-200 bg-slate-50">
                  {filtered.length === 0 ? (
                    <p className="p-4 text-center text-sm font-medium text-slate-400">No contacts found</p>
                  ) : (
                    filtered.map((contact) => (
                      <label
                        key={contact.id}
                        className={`flex cursor-pointer items-center gap-3 border-b border-slate-200 px-4 py-2.5 last:border-0 transition ${selected.has(contact.id) ? "bg-emerald-50/50" : "hover:bg-slate-100"}`}
                      >
                        <input
                          type="checkbox"
                          className="size-4 accent-emerald-500 rounded border-slate-300"
                          checked={selected.has(contact.id)}
                          onChange={() => toggle(contact.id)}
                        />
                        <div className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold shadow-sm ${selected.has(contact.id) ? "bg-emerald-500 text-white" : "bg-white text-slate-600 border border-slate-200"}`}>
                          {Array.from(contact.displayName)[0]?.toUpperCase() ?? "?"}
                        </div>
                        <div className="min-w-0">
                          <p className={`truncate text-sm font-bold ${selected.has(contact.id) ? "text-emerald-900" : "text-slate-700"}`}>{contact.displayName}</p>
                          <p className="truncate text-[11px] font-medium text-slate-400">{contact.phoneNumber ? `+${contact.phoneNumber}` : contact.externalId}</p>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </div>

            </div>
          </div>

        {/* Footer */}
        <div className="border-t border-slate-200 bg-white px-6 py-4 shadow-[0_-4px_10px_rgba(0,0,0,0.02)] z-10 relative">
          {error && (
            <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600 shadow-sm">
              <span className="mr-2">⚠️</span>{error}
            </p>
          )}
          {success && (
            <p className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700 shadow-sm">
              <span className="mr-2">✨</span>Broadcast queued! Check the queue panel for progress.
            </p>
          )}
          <div className="flex items-center justify-between gap-4">
            <div className="text-xs font-medium text-slate-500">
              <span className="font-bold text-slate-800">{selected.size}</span> selected
              {selected.size > 0 && (
                <> · ~<span className="font-bold text-slate-800">{estimatedMinutes} min</span> to complete</>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 hover:text-slate-900 shadow-sm transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={isPending || isUploading || selected.size === 0 || (!body.trim() && !file)}
                className="rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-emerald-500/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isUploading ? "Uploading..." : isPending ? "Queuing…" : `Queue Broadcast (${selected.size})`}
              </button>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
