import { googleSignInAction } from "./actions";

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">Log in</h1>
      <form action={googleSignInAction}>
        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-4 py-2 text-white"
        >
          Sign in with Google
        </button>
      </form>
    </main>
  );
}
