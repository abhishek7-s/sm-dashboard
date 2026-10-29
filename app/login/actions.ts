"use server";

import bcrypt from "bcrypt";
import { redirect } from "next/navigation";
import * as z from "zod";
import { prisma } from "@/lib/db";
import { createSession, deleteSession } from "@/lib/auth/session";

export type AuthFormState =
  | {
      error?: string;
      fieldErrors?: Partial<Record<"name" | "email" | "password", string[]>>;
    }
  | undefined;

const LoginSchema = z.object({
  email: z.email({ error: "Enter a valid email address." }).trim().toLowerCase(),
  password: z.string().min(1, { error: "Enter your password." }),
});

const SetupSchema = z.object({
  name: z.string().trim().min(2, { error: "Name must be at least 2 characters." }),
  email: z.email({ error: "Enter a valid email address." }).trim().toLowerCase(),
  password: z.string().min(8, { error: "Password must be at least 8 characters." }),
});

/** Only allow redirects back into this app, never to another site. */
function safeNextPath(value: FormDataEntryValue | null) {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function login(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  const passwordOk = user
    ? await bcrypt.compare(parsed.data.password, user.passwordHash)
    : false;

  if (!user || !passwordOk) {
    return { error: "Email or password is incorrect." };
  }

  await createSession(user.id);
  redirect(safeNextPath(formData.get("next")));
}

/** Creates the first (owner) account. Refuses once any user exists. */
export async function setupOwner(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = SetupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  if ((await prisma.user.count()) > 0) {
    return { error: "An account already exists. Please sign in instead." };
  }

  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash: await bcrypt.hash(parsed.data.password, 12),
    },
  });

  await createSession(user.id);
  redirect("/");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
