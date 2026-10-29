import type { WhatsAppConnectionState } from "@/lib/whatsapp/connection";

const styles: Record<WhatsAppConnectionState, { pill: string; dot: string }> = {
  connected: { pill: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  needs_qr: { pill: "bg-amber-50 text-amber-800 border-amber-200", dot: "bg-amber-500" },
  connecting: { pill: "bg-amber-50 text-amber-800 border-amber-200", dot: "bg-amber-500 animate-pulse" },
  worker_offline: { pill: "bg-rose-50 text-rose-700 border-rose-200", dot: "bg-rose-500" },
};

export function ConnectionPill({
  state,
  label,
}: {
  state: WhatsAppConnectionState;
  label: string;
}) {
  const style = styles[state];
  return (
    <span
      className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-bold ${style.pill}`}
      role="status"
    >
      <span className={`size-2 rounded-full ${style.dot}`} aria-hidden />
      {label}
    </span>
  );
}
