import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { auth } from "@/auth";
import NavLinks from "./nav-links";
import ThemeToggle from "./theme-toggle";

export default async function Nav() {
  const session = await auth();
  const user = session?.user;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
        <Link href={user ? "/daily" : "/"} className="group flex shrink-0 items-center gap-2 font-serif text-lg font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-ink transition-transform group-hover:-rotate-6">
            <GraduationCap size={18} />
          </span>
          <span className="sm:hidden lg:inline">
            Exam App<span className="text-accent">.</span>
          </span>
        </Link>
        <div className="flex items-center gap-1.5">
          {user ? (
            <NavLinks isAdmin={user.role === "ADMIN"} name={user.name ?? null} />
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
