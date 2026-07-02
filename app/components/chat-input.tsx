"use client";

import { useRef, useState, useTransition } from "react";
import { sendChatMessage } from "../actions";

type ChatInputProps = {
  conversationId: string;
  disabled?: boolean;
};

export function ChatInput({ conversationId, disabled }: ChatInputProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleSubmit = async (formData: FormData) => {
    const body = formData.get("body") as string;
    if (!body?.trim() && !file) return;

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
        alert("Failed to upload file");
        setIsUploading(false);
        return;
      }
      setIsUploading(false);
    }

    formRef.current?.reset();
    setFile(null);

    startTransition(async () => {
      await sendChatMessage(conversationId, body, mediaUrl, mediaMimeType);
    });
  };

  return (
    <form
      ref={formRef}
      action={handleSubmit}
      className="border-t border-slate-200 bg-white p-4 md:p-6 sticky bottom-0 z-20 shadow-[0_-4px_20px_rgba(0,0,0,0.02)]"
    >
      {file && (
        <div className="mb-3 flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200 p-3 shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-emerald-100 text-emerald-600 shadow-sm">
              {file.type.includes("image") ? "📷" : file.type.includes("video") ? "🎥" : "📄"}
            </div>
            <p className="truncate text-sm font-bold text-slate-700">{file.name}</p>
          </div>
          <button
            type="button"
            onClick={() => setFile(null)}
            className="grid size-8 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
          >
            ✕
          </button>
        </div>
      )}
      <div className="flex items-end gap-3">
        <button
          className="grid size-12 shrink-0 place-items-center rounded-xl border border-slate-200 bg-slate-50 text-xl text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 shadow-sm disabled:opacity-50"
          type="button"
          aria-label="Attach file"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isPending || isUploading}
        >
          📎
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
        <input
          name="body"
          type="text"
          placeholder={disabled ? "Sending disabled for this chat" : "Type a message..."}
          autoComplete="off"
          disabled={disabled || isPending || isUploading}
          className="min-h-12 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-5 py-3 text-[15px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 shadow-inner disabled:bg-slate-100 transition"
        />
        <button
          type="submit"
          disabled={disabled || isPending || isUploading}
          className="rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 px-6 py-3 text-sm font-bold tracking-wide text-white transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-emerald-500/20"
        >
          {isUploading ? "..." : "Send"}
        </button>
      </div>
    </form>
  );
}
