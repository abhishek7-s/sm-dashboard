import { WhatsAppSessionStatus } from "@prisma/client";
import { prisma } from "../db.ts";

// Written by the worker, read by the dashboard (see lib/whatsapp/connection.ts).

const SESSION_ID = "primary";

export const HEARTBEAT_INTERVAL_MS = 10_000;

export async function setWhatsAppSessionStatus(
  status: WhatsAppSessionStatus,
  extra: { qr?: string | null; lastError?: string | null } = {},
) {
  const data = {
    status,
    heartbeatAt: new Date(),
    ...(extra.qr !== undefined ? { qr: extra.qr, qrUpdatedAt: extra.qr ? new Date() : null } : {}),
    ...(extra.lastError !== undefined ? { lastError: extra.lastError } : {}),
  };

  await prisma.whatsAppSession.upsert({
    where: { id: SESSION_ID },
    create: { id: SESSION_ID, ...data },
    update: data,
  });
}

/** Records that the worker is alive. Returns true if the dashboard asked to unlink the device. */
export async function recordWorkerHeartbeat() {
  const session = await prisma.whatsAppSession.upsert({
    where: { id: SESSION_ID },
    create: { id: SESSION_ID, heartbeatAt: new Date() },
    update: { heartbeatAt: new Date() },
    select: { logoutRequestedAt: true },
  });
  return session.logoutRequestedAt !== null;
}

export async function clearLogoutRequest() {
  await prisma.whatsAppSession.updateMany({
    where: { id: SESSION_ID },
    data: { logoutRequestedAt: null },
  });
}

export async function requestWhatsAppLogout() {
  await prisma.whatsAppSession.upsert({
    where: { id: SESSION_ID },
    create: { id: SESSION_ID, logoutRequestedAt: new Date() },
    update: { logoutRequestedAt: new Date() },
  });
}

export async function getWhatsAppSessionRow() {
  return prisma.whatsAppSession.findUnique({ where: { id: SESSION_ID } });
}
