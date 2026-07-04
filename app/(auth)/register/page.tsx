"use client";

import { useActionState } from "react";
import Link from "next/link";
import { registerAction, type RegisterState } from "./actions";

const initialState: RegisterState = { error: null };

export default function RegisterPage() {
  const [state, formAction, pending] = useActionState(registerAction, initialState);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <h1 className="text-2xl font-semibold">Create an account</h1>
      <form action={formAction} className="flex flex-col gap-4">
        <input
          name="name"
          type="text"
          placeholder="Name (optional)"
          className="rounded-md border border-neutral-300 px-3 py-2"
        />
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
          minLength={8}
          className="rounded-md border border-neutral-300 px-3 py-2"
        />
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-3 py-2 text-white disabled:opacity-50"
        >
          {pending ? "Creating account…" : "Create account"}
        </button>
      </form>
      <p className="text-sm text-neutral-600">
        Already have an account?{" "}
        <Link href="/login" className="underline">
          Log in
        </Link>
      </p>
    </main>
  );
}
