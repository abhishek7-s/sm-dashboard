import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in · Social Messaging Dashboard",
};

type PageProps = {
  searchParams: Promise<{ next?: string }>;
};

export default async function LoginPage({ searchParams }: PageProps) {
  const { next } = await searchParams;
  if (await getCurrentUser()) redirect("/");
  const isFirstRun = (await prisma.user.count()) === 0;

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10 text-slate-900">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 grid size-12 place-items-center rounded-xl bg-[#24d366] text-base font-bold text-[#10241d] shadow-sm">
            SM
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isFirstRun ? "Create your account" : "Welcome back"}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {isFirstRun
              ? "Set up the owner account for this dashboard. You'll use it to sign in from now on."
              : "Sign in to manage your WhatsApp and Instagram messages."}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <LoginForm mode={isFirstRun ? "setup" : "login"} next={next} />
        </div>
      </div>
    </main>
  );
}
