import Link from "next/link";
import { auth } from "@/auth";
import { signOutAction } from "./sign-out-action";

export default async function Nav() {
  const session = await auth();
  const user = session?.user;

  return (
    <header className="border-b border-neutral-200">
      <nav className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <Link href="/" className="font-semibold">
          Exam App
        </Link>
        <div className="flex items-center gap-4 text-sm">
          {user ? (
            <>
              <Link href="/dashboard">Dashboard</Link>
              <Link href="/settings">Settings</Link>
              {user.role === "ADMIN" && <Link href="/admin">Admin</Link>}
              <form action={signOutAction}>
                <button type="submit" className="underline">
                  Logout
                </button>
              </form>
            </>
          ) : (
            <Link href="/login">Log in</Link>
          )}
        </div>
      </nav>
    </header>
  );
}
