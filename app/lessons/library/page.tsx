import { Library } from "lucide-react";
import { BATCH_ORDER, LIBRARY, LIBRARY_STATS, WATCH_PLAN } from "@/lib/video-library";
import { TRACKER_SUBJECTS, formatMinutes } from "@/lib/study-plan";
import { PageHeader, Card, Badge } from "@/components/ui";
import CopyPath from "../copy-path";

/**
 * Read-only view of the review lectures, refreshers and calculator
 * techniques on the G:\ drive: how long they really are, and every
 * recording of each topic across batches, so another instructor's version
 * is easy to find when one explanation doesn't click.
 */

const OTHER_CATEGORIES = ["Refresher", "Calculator technique"];

function hm(min: number) {
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
}

export default function LibraryPage() {
  const planPaths = new Set(WATCH_PLAN.map((v) => v.localPath.slice(0, v.localPath.lastIndexOf("\\"))));
  const planMinutes = WATCH_PLAN.reduce((s, v) => s + v.minutes, 0);
  const cat = LIBRARY_STATS.byCategory;

  const stats = [
    { label: "Review lectures", value: formatMinutes(cat["Main lecture"]), sub: "all batches and versions" },
    { label: "Refreshers", value: formatMinutes(cat["Refresher"]), sub: "all batches and versions" },
    { label: "Calculator techniques", value: formatMinutes(cat["Calculator technique"]), sub: "all batches" },
    {
      label: "Your watch plan",
      value: formatMinutes(planMinutes),
      sub: `${WATCH_PLAN.length} videos · ${formatMinutes(Math.round(planMinutes / 1.5))} at 1.5x · one recording per topic`,
    },
  ];

  return (
    <>
      <PageHeader
        icon={Library}
        eyebrow="Lessons"
        title="Video library"
        subtitle={`Review lectures, refreshers and calculator techniques on your drive (${LIBRARY_STATS.files.toLocaleString()} videos, ${formatMinutes(LIBRARY_STATS.totalMinutes)}), measured ${LIBRARY_STATS.measuredOn}. The plan uses one recording per topic; the rest are here when you want another instructor's take.`}
      />

      <div className="mb-10 grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s, i) => (
          <Card key={s.label} className={"p-4 " + (i === 3 ? "border-accent/50 bg-accent-soft/40" : "")}>
            <p className="text-xs text-ink-muted">{s.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{s.value}</p>
            <p className="mt-0.5 text-xs text-ink-muted">{s.sub}</p>
          </Card>
        ))}
      </div>

      {TRACKER_SUBJECTS.map((subj) => {
        const lectures = LIBRARY.filter((g) => g.subject === subj.slug && g.category === "Main lecture");
        const topics = [...new Map(lectures.map((g) => [g.topicNo, g.topic])).entries()].sort((a, b) => a[0] - b[0]);
        const others = OTHER_CATEGORIES.map((category) => ({
          cat: category,
          groups: LIBRARY.filter((g) => g.subject === subj.slug && g.category === category).sort(
            (a, b) => BATCH_ORDER.indexOf(a.batch) - BATCH_ORDER.indexOf(b.batch) || a.topicNo - b.topicNo || a.version.localeCompare(b.version)
          ),
        })).filter((o) => o.groups.length > 0);

        return (
          <section key={subj.slug} className="mb-12">
            <h2 className="mb-3 text-lg font-semibold">{subj.name}</h2>
            <Card className="overflow-x-auto p-0">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-ink-muted">
                    <th className="px-4 py-2.5 font-medium">Topic</th>
                    {BATCH_ORDER.slice(0, 4).map((b) => (
                      <th key={b} className="px-3 py-2.5 font-medium">{b}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {topics.map(([no, name]) => (
                    <tr key={no} className="border-b border-border align-top last:border-0">
                      <td className="px-4 py-2.5">
                        <span className="text-ink-muted tabular-nums">{String(no).padStart(2, "0")}</span> {name}
                      </td>
                      {BATCH_ORDER.slice(0, 4).map((b) => {
                        const cells = lectures.filter((g) => g.topicNo === no && g.batch === b).sort((x, y) => x.version.localeCompare(y.version));
                        return (
                          <td key={b} className="px-3 py-2">
                            {cells.length === 0 ? (
                              <span className="text-ink-faint">–</span>
                            ) : (
                              <div className="flex flex-col gap-1">
                                {cells.map((g, gi) => {
                                  const inPlan = planPaths.has(g.folder) && b === "Oct 2024 batch" && g.version === "V1";
                                  const clash = cells.filter((c) => c.version === g.version).length > 1;
                                  const label = cells.length > 1 ? (clash ? `${g.version}·${cells.indexOf(g) + 1}` : g.version) : "";
                                  return (
                                    <span key={`${g.folder}|${g.version}|${gi}`} className="flex items-center gap-1.5 whitespace-nowrap" title={g.folder}>
                                      <span className={"tabular-nums " + (inPlan ? "font-medium text-accent" : "")}>
                                        {label ? `${label} ` : ""}
                                        {hm(g.minutes)}
                                      </span>
                                      {inPlan && <Badge tone="accent" className="px-1.5 py-0 text-[10px]">plan</Badge>}
                                      <CopyPath path={g.folder} label="" />
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <details className="mt-3 rounded-xl border border-border bg-bg-elevated">
              <summary className="cursor-pointer px-4 py-3 text-sm text-ink-muted">
                Refreshers and calculator techniques ·{" "}
                {formatMinutes(others.reduce((s, o) => s + o.groups.reduce((x, g) => x + g.minutes, 0), 0))}
              </summary>
              <div className="flex flex-col gap-4 border-t border-border px-4 py-4">
                {others.map((o) => (
                  <div key={o.cat}>
                    <p className="mb-1.5 text-xs font-medium tracking-wide text-ink-muted uppercase">
                      {o.cat} · {formatMinutes(o.groups.reduce((x, g) => x + g.minutes, 0))}
                    </p>
                    <ul className="flex flex-col gap-1 text-sm">
                      {o.groups.map((g, gi) => (
                        <li key={`${g.folder}|${g.version}|${g.topicNo}|${gi}`} className="flex items-center gap-2">
                          <span className="w-44 shrink-0 truncate text-ink-muted">{g.batch}</span>
                          <span className="min-w-0 flex-1 truncate">
                            {g.topic || g.folder.split("\\").pop()}
                            {g.version && g.version !== "V1" ? ` · ${g.version}` : ""}
                          </span>
                          <span className="shrink-0 text-xs text-ink-muted tabular-nums">
                            {g.videos} · {hm(g.minutes)}
                          </span>
                          <CopyPath path={g.folder} label="" />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </details>
          </section>
        );
      })}
    </>
  );
}
