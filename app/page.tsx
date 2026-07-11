import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LinkButton } from "@/components/ui";

export default async function HomePage() {
  const session = await auth();
  if (session?.user) {
    redirect(session.user.role === "ADMIN" ? "/admin" : "/dashboard");
  }

  return (
    <main className="bg-hero-glow flex w-full flex-1 flex-col items-center justify-center px-4 text-center">
      <p className="mb-4 text-xs font-medium tracking-wide text-accent uppercase">
        Licensure exam practice
      </p>
      <h1 className="max-w-lg text-4xl font-semibold text-ink sm:text-5xl">
        Study with purpose, not guesswork.
      </h1>
      <p className="mt-4 max-w-sm text-ink-muted">
        Practice real exam questions, track your accuracy over time, and see
        exactly where to focus next.
      </p>
      <LinkButton href="/login" className="mt-8" size="md">
        Log in to start
      </LinkButton>
    </main>
  );
}
