import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function AdminContentPage() {
  const subjects = await prisma.subject.findMany({
    orderBy: { name: "asc" },
    include: { exams: { include: { _count: { select: { questions: true } } } } },
  });

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-xl font-semibold">Content</h1>
      {subjects.length === 0 ? (
        <p className="text-sm text-neutral-500">
          No exams yet — use{" "}
          <Link href="/admin/import" className="underline">
            Import
          </Link>{" "}
          to add some.
        </p>
      ) : (
        subjects.map((s) => (
          <div key={s.id}>
            <h2 className="mb-2 font-medium">{s.name}</h2>
            <ul className="flex flex-col gap-1 text-sm">
              {s.exams.map((e) => (
                <li key={e.id}>
                  <Link href={`/admin/content/exams/${e.id}`} className="underline">
                    {e.title}
                  </Link>{" "}
                  <span className="text-neutral-500">
                    ({e._count.questions} questions)
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}
