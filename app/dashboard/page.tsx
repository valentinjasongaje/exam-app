import { auth } from "@/auth";

export default async function DashboardPage() {
  const session = await auth();

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <h1 className="text-2xl font-semibold">
        Welcome{session?.user?.name ? `, ${session.user.name}` : ""}
      </h1>
      <p className="mt-2 text-neutral-600">
        Exam-taking isn&apos;t built yet — check back once the question bank
        has been imported.
      </p>
    </main>
  );
}
