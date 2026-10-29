import QRCode from "qrcode";
import { HEARTBEAT_INTERVAL_MS, getWhatsAppSessionRow } from "./session-state";

export type WhatsAppConnectionState =
  | "connected"
  | "needs_qr"
  | "connecting"
  | "worker_offline";

export type WhatsAppConnection = {
  state: WhatsAppConnectionState;
  label: string;
  description: string;
  qrDataUrl: string | null;
  logoutPending: boolean;
};

// Three missed heartbeats means the worker process is not running.
const OFFLINE_AFTER_MS = HEARTBEAT_INTERVAL_MS * 3;

/** Turns the worker's raw session row into something we can show an end user. */
export async function getWhatsAppConnection(): Promise<WhatsAppConnection> {
  const session = await getWhatsAppSessionRow();
  const logoutPending = Boolean(session?.logoutRequestedAt);
  const isAlive =
    session?.heartbeatAt &&
    Date.now() - session.heartbeatAt.getTime() < OFFLINE_AFTER_MS &&
    session.status !== "STOPPED";

  if (!session || !isAlive) {
    return {
      state: "worker_offline",
      label: "Offline",
      description:
        "The WhatsApp service isn't running, so new messages won't arrive and sent messages will wait. Ask your administrator to start it (npm run whatsapp:worker).",
      qrDataUrl: null,
      logoutPending,
    };
  }

  if (session.status === "QR_READY" && session.qr) {
    return {
      state: "needs_qr",
      label: "Not linked",
      description: "Scan the QR code with your phone to link WhatsApp.",
      qrDataUrl: await QRCode.toDataURL(session.qr, { margin: 1, width: 264 }),
      logoutPending,
    };
  }

  if (session.status === "CONNECTED") {
    return {
      state: "connected",
      label: "Connected",
      description: "Messages are syncing.",
      qrDataUrl: null,
      logoutPending,
    };
  }

  return {
    state: "connecting",
    label: session.status === "LOGGED_OUT" ? "Preparing new link…" : "Reconnecting…",
    description:
      session.status === "LOGGED_OUT"
        ? "WhatsApp was unlinked. A new QR code will appear in a few seconds."
        : "Trying to reach WhatsApp. Messages you send now will go out once it reconnects.",
    qrDataUrl: null,
    logoutPending,
  };
}
