import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge } from "@/components/ui";

export default async function AdminUsersPage() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      attempts: {
        select: { score: true, totalQuestions: true, startedAt: true, finishedAt: true },
      },
    },
  });

  const rows = users.map((u) => {
    const completed = u.attempts.filter((a) => a.finishedAt);
    const totalCorrect = completed.reduce((sum, a) => sum + (a.score ?? 0), 0);
    const totalQuestions = completed.reduce((sum, a) => sum + a.totalQuestions, 0);
    const accuracy =
      totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : null;
    const lastActivity = u.attempts.reduce<Date | null>(
      (latest, a) => (!latest || a.startedAt > latest ? a.startedAt : latest),
      null
    );

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      examsTaken: completed.length,
      accuracy,
      lastActivity,
    };
  });

  return (
    <div>
      <PageHeader title="Users" subtitle={`${rows.length} registered`} />

      {/* Mobile: stacked cards */}
      <div className="flex flex-col gap-3 sm:hidden">
        {rows.map((r) => (
          <Card key={r.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={`/admin/users/${r.id}`}
                  className="font-medium text-accent hover:underline"
                >
                  {r.name || "—"}
                </Link>
                <p className="truncate text-xs text-ink-muted">{r.email}</p>
              </div>
              <Badge tone={r.role === "ADMIN" ? "accent" : "muted"}>{r.role}</Badge>
            </div>
            <div className="mt-3 flex items-center gap-4 text-xs text-ink-muted">
              <span>{r.examsTaken} exams</span>
              <span>{r.accuracy !== null ? `${r.accuracy}% accuracy` : "No attempts"}</span>
            </div>
            <p className="mt-1 text-xs text-ink-faint">
              Last activity: {r.lastActivity ? r.lastActivity.toLocaleDateString() : "—"}
            </p>
          </Card>
        ))}
      </div>

      {/* Desktop: table */}
      <Card className="hidden overflow-x-auto p-0 sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-ink-muted">
              <th className="px-5 py-3 font-normal">Name</th>
              <th className="px-5 py-3 font-normal">Role</th>
              <th className="px-5 py-3 font-normal">Exams taken</th>
              <th className="px-5 py-3 font-normal">Accuracy</th>
              <th className="px-5 py-3 font-normal">Last activity</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0">
                <td className="px-5 py-3">
                  <Link href={`/admin/users/${r.id}`} className="font-medium text-accent hover:underline">
                    {r.name || "—"}
                  </Link>
                  <p className="text-xs text-ink-muted">{r.email}</p>
                </td>
                <td className="px-5 py-3">
                  <Badge tone={r.role === "ADMIN" ? "accent" : "muted"}>{r.role}</Badge>
                </td>
                <td className="px-5 py-3">{r.examsTaken}</td>
                <td className="px-5 py-3">{r.accuracy !== null ? `${r.accuracy}%` : "—"}</td>
                <td className="px-5 py-3 text-ink-muted">
                  {r.lastActivity ? r.lastActivity.toLocaleDateString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
