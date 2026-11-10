import Link from "next/link";
import { clsx } from "clsx";
import { PageHeader, Card, Badge } from "@/components/ui";
import { auth } from "@/auth";
import { usersProgress, type UserProgressRow } from "@/lib/admin-progress";
import { formatMinutes, subjectName } from "@/lib/study-plan";
import AccessPanel from "./access-panel";

export const dynamic = "force-dynamic";

/** "today", "yesterday", "3 days ago", or a date. */
function ago(d: Date | null) {
  if (!d) return "Never";
  const day = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const days = Math.round((Date.parse(day(new Date())) - Date.parse(day(d))) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 14) return `${days} days ago`;
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "Asia/Manila" });
}

function WeekCell({ r }: { r: UserProgressRow }) {
  const pct = r.weekTarget ? Math.min(100, (r.weekMinutes / r.weekTarget) * 100) : 0;
  return (
    <div className="min-w-32">
      <p className="tabular-nums">
        <span className="font-medium">{formatMinutes(r.weekMinutes)}</span>
        {r.weekTarget > 0 && <span className="text-ink-muted"> / {formatMinutes(r.weekTarget)}</span>}
      </p>
      {r.weekTarget > 0 && (
        <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-bg-muted">
          <div className={clsx("h-full rounded-full", pct >= 100 ? "bg-success" : "bg-accent")} style={{ width: `${pct}%` }} />
        </div>
      )}
      {r.behind && (
        <p className="mt-0.5 text-xs text-danger">
          {subjectName(r.behind.subject)} behind {formatMinutes(r.behind.minutes)}
        </p>
      )}
    </div>
  );
}

/** Everyone's progress at a glance; a name opens the details. */
export default async function AdminUsersPage() {
  const session = await auth();
  const rows = await usersProgress();
  const active = rows.filter((r) => r.activeRecently).length;

  return (
    <div>
      <PageHeader title="Users" subtitle={`${rows.length} registered · ${active} active in the last 7 days`} />
      <AccessPanel myEmail={session?.user?.email ?? null} />

      <h2 className="mt-8 mb-3 text-sm font-medium tracking-wide text-ink-muted uppercase">Progress</h2>

      {/* Phones: cards */}
      <div className="flex flex-col gap-3 md:hidden">
        {rows.map((r) => (
          <Card key={r.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={`/admin/users/${r.id}`} className="font-medium text-accent hover:underline">
                  {r.name || r.email}
                </Link>
                <p className="truncate text-xs text-ink-muted">
                  {r.email} · active {ago(r.lastActive).toLowerCase()}
                </p>
              </div>
              <Badge tone={r.role === "ADMIN" ? "accent" : "muted"}>{r.role}</Badge>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-ink-muted">This week</p>
                <WeekCell r={r} />
              </div>
              <div>
                <p className="text-xs text-ink-muted">Videos</p>
                <p className="tabular-nums">
                  {r.videosWatched}/{r.videosTotal}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-muted">Practice</p>
                <p className="tabular-nums">
                  {r.answered.toLocaleString()} answered{r.accuracy !== null && ` · ${r.accuracy}%`}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-muted">Daily · mistakes due</p>
                <p className="tabular-nums">
                  {r.dailyDaysThisWeek}/7 · {r.mistakesDue}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Larger screens: table */}
      <Card className="hidden overflow-x-auto p-0 md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-ink-muted">
              <th className="px-4 py-3 font-normal">Name</th>
              <th className="px-4 py-3 font-normal">Last active</th>
              <th className="px-4 py-3 font-normal">Study this week</th>
              <th className="px-4 py-3 font-normal">Videos watched</th>
              <th className="px-4 py-3 font-normal">Practice</th>
              <th className="px-4 py-3 font-normal" title="Days this week with a finished 15-minute session">
                Daily
              </th>
              <th className="px-4 py-3 font-normal">Mistakes due</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border align-top last:border-0">
                <td className="px-4 py-3">
                  <Link href={`/admin/users/${r.id}`} className="font-medium text-accent hover:underline">
                    {r.name || r.email}
                  </Link>
                  <p className="text-xs text-ink-muted">
                    {r.email}
                    {r.role === "ADMIN" && " · admin"}
                  </p>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-ink-muted">{ago(r.lastActive)}</td>
                <td className="px-4 py-3">
                  <WeekCell r={r} />
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {r.videosWatched}
                  <span className="text-ink-muted"> / {r.videosTotal}</span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                  {r.answered.toLocaleString()} answered
                  <p className="text-xs text-ink-muted">
                    {r.accuracy !== null ? `${r.accuracy}% correct · ${r.examsFinished} exams` : "No exams yet"}
                  </p>
                </td>
                <td className="px-4 py-3 tabular-nums">{r.dailyDaysThisWeek}/7</td>
                <td className="px-4 py-3 tabular-nums">{r.mistakesDue}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
