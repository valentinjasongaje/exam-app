import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function HomePage() {
  const session = await auth();
  if (session?.user) {
    redirect(session.user.role === "ADMIN" ? "/admin" : "/dashboard");
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-3xl font-semibold">Exam App</h1>
      <p className="text-neutral-600">
        Practice licensure exam questions and track your progress.
      </p>
      <Link href="/login" className="rounded-md bg-neutral-900 px-4 py-2 text-white">
        Log in
      </Link>
    </main>
  );
}
