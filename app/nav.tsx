import Link from "next/link";
import { auth } from "@/auth";
import NavLinks from "./nav-links";
import ThemeToggle from "./theme-toggle";

export default async function Nav() {
  const session = await auth();
  const user = session?.user;

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-bg/80 backdrop-blur-sm">
      <nav className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
        <Link href="/" className="flex items-center gap-1.5 font-serif text-lg font-semibold">
          Exam App
          <span className="text-accent">.</span>
        </Link>
        <div className="flex items-center gap-4">
          {user ? (
            <NavLinks isAdmin={user.role === "ADMIN"} />
          ) : (
            <Link href="/login" className="text-sm text-ink-muted transition-colors hover:text-ink">
              Log in
            </Link>
          )}
          <ThemeToggle />
        </div>
      </nav>
    </header>
  );
}
