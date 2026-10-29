"use client";

import { useActionState } from "react";
import { login, setupOwner } from "./actions";

type LoginFormProps = {
  mode: "login" | "setup";
  next?: string;
};

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[15px] text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40";

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return <p className="mt-1.5 text-sm text-rose-600">{messages[0]}</p>;
}

export function LoginForm({ mode, next }: LoginFormProps) {
  const [state, action, pending] = useActionState(
    mode === "setup" ? setupOwner : login,
    undefined,
  );

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {state?.error ? (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {state.error}
        </div>
      ) : null}

      {mode === "setup" ? (
        <div>
          <label htmlFor="name" className="mb-1.5 block text-sm font-semibold text-slate-700">
            Your name
          </label>
          <input id="name" name="name" autoComplete="name" required className={inputClass} />
          <FieldError messages={state?.fieldErrors?.name} />
        </div>
      ) : null}

      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-slate-700">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus={mode === "login"}
          className={inputClass}
        />
        <FieldError messages={state?.fieldErrors?.email} />
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-semibold text-slate-700">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "setup" ? "new-password" : "current-password"}
          required
          className={inputClass}
        />
        {mode === "setup" && !state?.fieldErrors?.password ? (
          <p className="mt-1.5 text-xs text-slate-500">At least 8 characters.</p>
        ) : null}
        <FieldError messages={state?.fieldErrors?.password} />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending
          ? mode === "setup" ? "Creating account…" : "Signing in…"
          : mode === "setup" ? "Create account" : "Sign in"}
      </button>
    </form>
  );
}
