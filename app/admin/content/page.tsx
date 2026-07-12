import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, EmptyState } from "@/components/ui";

export default async function AdminContentPage() {
  const subjects = await prisma.subject.findMany({
    orderBy: { name: "asc" },
    include: {
      exams: {
        orderBy: { title: "asc" },
        include: { _count: { select: { questions: true } } },
      },
    },
  });

  return (
    <div>
      <PageHeader title="Content" />
      {subjects.length === 0 ? (
        <EmptyState>
          No exams yet — use{" "}
          <Link href="/admin/import" className="text-accent hover:underline">
            Import
          </Link>{" "}
          to add some.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-8">
          {subjects.map((s) => (
            <div key={s.id}>
              <h2 className="mb-3 text-sm font-medium tracking-wide text-ink-muted uppercase">
                {s.name}
              </h2>
              <div className="flex flex-col gap-2">
                {s.exams.map((e) => (
                  <Card key={e.id} className="flex items-center justify-between">
                    <Link
                      href={`/admin/content/exams/${e.id}`}
                      className="font-medium text-accent hover:underline"
                    >
                      {e.title}
                    </Link>
                    <span className="text-sm text-ink-muted">
                      {e._count.questions} questions
                    </span>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
