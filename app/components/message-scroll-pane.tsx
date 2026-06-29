"use client";

import { useEffect, useRef } from "react";

type MessageScrollPaneProps = {
  children: React.ReactNode;
  scrollKey: string;
};

export function MessageScrollPane({
  children,
  scrollKey,
}: MessageScrollPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    container.scrollTop = container.scrollHeight;
  }, [scrollKey]);

  return (
    <div
      ref={containerRef}
      className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 md:p-6"
    >
      {children}
    </div>
  );
}
