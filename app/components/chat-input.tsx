"use client";

import { useRef, useTransition } from "react";
import { sendChatMessage } from "../actions";

type ChatInputProps = {
  conversationId: string;
  disabled?: boolean;
};

export function ChatInput({ conversationId, disabled }: ChatInputProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (formData: FormData) => {
    const body = formData.get("body") as string;
    if (!body?.trim()) return;

    // Optimistically reset form
    formRef.current?.reset();

    startTransition(async () => {
      await sendChatMessage(conversationId, body);
    });
  };

  return (
    <form
      ref={formRef}
      action={handleSubmit}
      className="border-t border-black/10 bg-[#f7faf8] p-3 md:p-4"
    >
      <div className="flex items-end gap-3">
        <button
          className="grid size-11 shrink-0 place-items-center rounded-lg border border-black/10 bg-white text-xl"
          type="button"
          aria-label="Attach file"
          disabled={disabled || isPending}
        >
          +
        </button>
        <input
          name="body"
          type="text"
          placeholder={disabled ? "Sending disabled for this chat" : "Type a message"}
          autoComplete="off"
          disabled={disabled || isPending}
          className="min-h-11 flex-1 rounded-lg border border-black/10 bg-white px-4 py-3 text-sm text-[#15201c] placeholder:text-[#65766f] focus:outline-none focus:ring-2 focus:ring-[#24d366] disabled:bg-gray-100 disabled:cursor-not-allowed"
        />
        <button
          type="submit"
          disabled={disabled || isPending}
          className="rounded-lg bg-[#24d366] px-5 py-3 text-sm font-bold text-[#10241d] transition hover:bg-[#20bd5c] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </div>
    </form>
  );
}
