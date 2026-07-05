import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const subjects = await prisma.subject.findMany({
    orderBy: { name: "asc" },
    include: {
      exams: {
        include: {
          _count: { select: { questions: true } },
          attempts: {
            where: { userId: session.user.id },
            orderBy: { startedAt: "desc" },
          },
        },
      },
    },
  });

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold">
        Welcome{session.user.name ? `, ${session.user.name}` : ""}
      </h1>

      {subjects.length === 0 ? (
        <p className="text-sm text-neutral-500">No exams available yet.</p>
      ) : (
        <div className="flex flex-col gap-8">
          {subjects.map((s) => (
            <div key={s.id}>
              <h2 className="mb-2 font-medium">{s.name}</h2>
              <ul className="flex flex-col gap-2">
                {s.exams.map((e) => {
                  const inProgress = e.attempts.find((a) => !a.finishedAt);
                  const finished = e.attempts.filter((a) => a.finishedAt);
                  const bestAttempt = finished.length
                    ? finished.reduce((best, a) => ((a.score ?? 0) > (best.score ?? 0) ? a : best))
                    : null;

                  return (
                    <li
                      key={e.id}
                      className="flex items-center justify-between gap-4 border-b border-neutral-100 pb-2 text-sm"
                    >
                      <div>
                        <p>{e.title}</p>
                        <p className="text-neutral-500">
                          {e._count.questions} questions
                          {bestAttempt &&
                            ` · best score ${bestAttempt.score}/${bestAttempt.totalQuestions}`}
                        </p>
                      </div>
                      <Link
                        href={`/exam/${e.id}`}
                        className="shrink-0 rounded-md bg-neutral-900 px-3 py-1.5 text-white"
                      >
                        {inProgress ? "Resume" : finished.length ? "Retake" : "Start"}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
