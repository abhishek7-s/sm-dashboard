"use client";

import { useRef, useState, useTransition } from "react";
import { sendChatMessage } from "../actions";

type ChatInputProps = {
  conversationId: string;
  disabled?: boolean;
  disabledReason?: string;
};

const MAX_UPLOAD_BYTES = 16 * 1024 * 1024;

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ChatInput({ conversationId, disabled, disabledReason }: ChatInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isPending, startTransition] = useTransition();
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isBusy = isPending || isUploading;
  const canSend = !disabled && !isBusy && (body.trim().length > 0 || file !== null);

  const resizeTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const pickFile = (picked: File | undefined) => {
    if (!picked) return;
    if (picked.size > MAX_UPLOAD_BYTES) {
      setError(`"${picked.name}" is ${formatBytes(picked.size)}. Files must be 16 MB or smaller.`);
      return;
    }
    setError(null);
    setFile(picked);
  };

  const handleSend = async () => {
    if (!canSend) return;
    setError(null);

    const text = body;
    const attachment = file;
    let mediaUrl: string | undefined;
    let mediaMimeType: string | undefined;

    if (attachment) {
      setIsUploading(true);
      try {
        const uploadData = new FormData();
        uploadData.append("file", attachment);
        const res = await fetch("/api/upload", { method: "POST", body: uploadData });
        const result = await res.json().catch(() => ({}));
        if (!res.ok || !result.success) {
          throw new Error(result.error ?? "Upload failed");
        }
        mediaUrl = result.mediaUrl;
        mediaMimeType = result.mediaMimeType;
      } catch (err) {
        setError(`Couldn't upload the file: ${err instanceof Error ? err.message : "please try again."}`);
        setIsUploading(false);
        return;
      }
      setIsUploading(false);
    }

    // Clear right away so the composer feels instant; restore if the send fails.
    setBody("");
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    requestAnimationFrame(resizeTextarea);

    startTransition(async () => {
      const result = await sendChatMessage(conversationId, text, mediaUrl, mediaMimeType);
      if (result && "error" in result && result.error) {
        setBody(text);
        setFile(attachment);
        setError(`Message not sent: ${result.error}`);
      }
      textareaRef.current?.focus();
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void handleSend();
      }}
      className="sticky bottom-0 z-20 border-t border-slate-200 bg-white p-3 shadow-[0_-4px_20px_rgba(0,0,0,0.02)] md:p-4"
    >
      {error ? (
        <div role="alert" className="mb-3 flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="shrink-0 font-bold" aria-label="Dismiss error">
            ✕
          </button>
        </div>
      ) : null}

      {file ? (
        <div className="mb-3 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-sm">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-emerald-100 text-emerald-600 shadow-sm" aria-hidden>
              {file.type.includes("image") ? "📷" : file.type.includes("video") ? "🎥" : "📄"}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-700">{file.name}</p>
              <p className="text-xs text-slate-500">
                {formatBytes(file.size)}
                {isUploading ? " · uploading…" : ""}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setFile(null);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
            disabled={isUploading}
            className="grid size-8 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
            aria-label="Remove attachment"
          >
            ✕
          </button>
        </div>
      ) : null}

      <div className="flex items-end gap-2 md:gap-3">
        <button
          className="grid size-12 shrink-0 place-items-center rounded-xl border border-slate-200 bg-slate-50 text-xl text-slate-600 shadow-sm transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
          type="button"
          aria-label="Attach a file"
          title="Attach a file (max 16 MB)"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isBusy}
        >
          📎
        </button>
        <input
          type="file"
          className="hidden"
          ref={fileInputRef}
          onChange={(e) => pickFile(e.target.files?.[0])}
        />
        <textarea
          ref={textareaRef}
          name="body"
          rows={1}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            resizeTextarea();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void handleSend();
            }
          }}
          onPaste={(e) => {
            const pasted = Array.from(e.clipboardData.files)[0];
            if (pasted) {
              e.preventDefault();
              pickFile(pasted);
            }
          }}
          placeholder={disabled ? disabledReason ?? "Sending is disabled for this chat" : "Type a message"}
          aria-label="Message"
          autoComplete="off"
          disabled={disabled}
          className="max-h-40 min-h-12 flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[15px] leading-6 text-slate-800 shadow-inner transition placeholder:text-slate-400 focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 disabled:bg-slate-100"
        />
        <button
          type="submit"
          disabled={!canSend}
          className="h-12 shrink-0 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 px-4 text-sm font-bold tracking-wide text-white shadow-md shadow-emerald-500/20 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 md:px-6"
        >
          {isUploading ? "Uploading…" : isPending ? "Sending…" : "Send"}
        </button>
      </div>
      <p className="mt-1.5 hidden text-[11px] text-slate-400 md:block">
        Enter to send · Shift + Enter for a new line
      </p>
    </form>
  );
}
