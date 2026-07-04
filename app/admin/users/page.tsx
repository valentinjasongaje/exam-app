import Link from "next/link";
import { prisma } from "@/lib/prisma";

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
      <h1 className="mb-4 text-xl font-semibold">Users</h1>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-neutral-500">
            <th className="py-2 pr-4 font-normal">Name</th>
            <th className="py-2 pr-4 font-normal">Email</th>
            <th className="py-2 pr-4 font-normal">Role</th>
            <th className="py-2 pr-4 font-normal">Exams taken</th>
            <th className="py-2 pr-4 font-normal">Accuracy</th>
            <th className="py-2 pr-4 font-normal">Last activity</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-neutral-100">
              <td className="py-2 pr-4">
                <Link href={`/admin/users/${r.id}`} className="underline">
                  {r.name || "—"}
                </Link>
              </td>
              <td className="py-2 pr-4">{r.email}</td>
              <td className="py-2 pr-4">{r.role}</td>
              <td className="py-2 pr-4">{r.examsTaken}</td>
              <td className="py-2 pr-4">{r.accuracy !== null ? `${r.accuracy}%` : "—"}</td>
              <td className="py-2 pr-4">
                {r.lastActivity ? r.lastActivity.toLocaleDateString() : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
