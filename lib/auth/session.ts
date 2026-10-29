import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "@/lib/db";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  signSessionToken,
  verifySessionToken,
} from "./token";

export async function createSession(userId: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, signSessionToken(userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

/** The signed-in user, or null. Cached per request. */
export const getCurrentUser = cache(async () => {
  const cookieStore = await cookies();
  const userId = verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!userId) return null;

  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true },
  });
});

/** Use at the top of every page, server action and route handler that touches data. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
