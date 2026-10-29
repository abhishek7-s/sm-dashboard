import jwt from "jsonwebtoken";

// Kept free of Prisma / next/headers so proxy.ts can import it cheaply.

export const SESSION_COOKIE = "sm_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

type SessionPayload = {
  sub: string;
};

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET must be set in .env (at least 32 characters).");
  }
  return secret;
}

export function signSessionToken(userId: string) {
  return jwt.sign({ sub: userId } satisfies SessionPayload, getSecret(), {
    expiresIn: SESSION_TTL_SECONDS,
  });
}

/** Returns the user id from a session token, or null if it is missing/invalid/expired. */
export function verifySessionToken(token: string | undefined): string | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, getSecret()) as SessionPayload;
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
