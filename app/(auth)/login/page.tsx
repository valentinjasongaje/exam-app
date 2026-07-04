"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <h1 className="text-2xl font-semibold">Log in</h1>
      <form action={formAction} className="flex flex-col gap-4">
        <input
          name="email"
          type="email"
          placeholder="Email"
          required
          className="rounded-md border border-neutral-300 px-3 py-2"
        />
        <input
          name="password"
          type="password"
          placeholder="Password"
          required
          className="rounded-md border border-neutral-300 px-3 py-2"
        />
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-3 py-2 text-white disabled:opacity-50"
        >
          {pending ? "Logging in…" : "Log in"}
        </button>
      </form>
      <p className="text-sm text-neutral-600">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="underline">
          Sign up
        </Link>
      </p>
    </main>
  );
}
