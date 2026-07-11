import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/ui";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const subjects = await prisma.subject.findMany({
    orderBy: { name: "asc" },
    include: {
      exams: {
        include: {
          attempts: {
            where: { userId: session.user.id },
          },
        },
      },
    },
  });

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <PageHeader
        eyebrow="Your library"
        title={`Welcome${session.user.name ? `, ${session.user.name.split(" ")[0]}` : ""}`}
        subtitle="Pick a subject to keep studying."
      />

      {subjects.length === 0 ? (
        <EmptyState>No exams available yet.</EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {subjects.map((s) => {
            const examCount = s.exams.length;
            const completedCount = s.exams.filter((e) =>
              e.attempts.some((a) => a.finishedAt)
            ).length;
            const finishedAttempts = s.exams.flatMap((e) =>
              e.attempts.filter((a) => a.finishedAt)
            );
            const totalCorrect = finishedAttempts.reduce((sum, a) => sum + (a.score ?? 0), 0);
            const totalQuestions = finishedAttempts.reduce((sum, a) => sum + a.totalQuestions, 0);
            const accuracy =
              totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : null;
            const progressPct = examCount > 0 ? (completedCount / examCount) * 100 : 0;

            return (
              <Link
                key={s.id}
                href={`/subject/${s.id}`}
                className="group rounded-xl border border-border bg-bg-elevated p-6 transition-colors hover:border-accent"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-serif text-xl font-semibold">{s.name}</h2>
                    <p className="mt-1 text-sm text-ink-muted">{examCount} exams</p>
                  </div>
                  <ArrowRight
                    size={18}
                    className="mt-1 shrink-0 text-ink-faint transition-colors group-hover:text-accent"
                  />
                </div>

                <div className="mt-6">
                  <div className="mb-1.5 flex items-center justify-between text-xs text-ink-muted">
                    <span>
                      {completedCount}/{examCount} completed
                    </span>
                    {accuracy !== null && <span>{accuracy}% accuracy</span>}
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-bg-muted">
                    <div
                      className="h-full rounded-full bg-accent transition-[width]"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
