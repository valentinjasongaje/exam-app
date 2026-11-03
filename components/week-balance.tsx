import Link from "next/link";
import { clsx } from "clsx";
import { formatMinutes, subjectName } from "@/lib/study-plan";
import { mostBehind, subjectBg, type BalanceRow } from "@/lib/study-balance";

/**
 * This week's study per subject against its weekly target. The bar is the
 * subject's own colour; a faint tick marks where "on pace" would be today.
 */
export default function WeekBalance({
  rows,
  pace,
  showNudge = true,
}: {
  rows: BalanceRow[];
  /** Share of the week elapsed (0–1), for the on-pace tick; omit for past/future weeks. */
  pace?: number;
  showNudge?: boolean;
}) {
  const total = rows.reduce((s, r) => s + r.minutes, 0);
  const targetTotal = rows.reduce((s, r) => s + r.target, 0);
  const behind = showNudge ? mostBehind(rows) : null;

  if (rows.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        Nothing studied yet and no targets set.{" "}
        <Link href="/settings" className="text-accent hover:underline">
          Set weekly targets
        </Link>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-muted">
        <span className="text-lg font-semibold text-ink tabular-nums">{formatMinutes(total)}</span>
        {targetTotal > 0 && <> of {formatMinutes(targetTotal)} target</>}
      </p>
      <ul className="flex flex-col gap-2.5">
        {rows.map((r) => {
          const pct = r.target > 0 ? Math.min(100, (r.minutes / r.target) * 100) : 100;
          const done = r.target > 0 && r.minutes >= r.target;
          return (
            <li key={r.subject}>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                <span className="flex items-center gap-1.5 font-medium">
                  <span className={clsx("h-2.5 w-2.5 rounded-full", subjectBg(r.subject))} />
                  {subjectName(r.subject)}
                </span>
                <span className="text-xs text-ink-muted tabular-nums">
                  <span className={clsx(done ? "font-medium text-success" : "text-ink")}>{formatMinutes(r.minutes)}</span>
                  {r.target > 0 ? ` / ${formatMinutes(r.target)}` : " · no target"}
                </span>
              </div>
              <div className="relative h-2 overflow-hidden rounded-full bg-bg-muted">
                <div
                  className={clsx("bar-fill h-full rounded-full", subjectBg(r.subject), r.target === 0 && "opacity-40")}
                  style={{ width: `${pct}%` }}
                />
                {pace !== undefined && r.target > 0 && pace > 0 && pace < 1 && (
                  <span className="absolute inset-y-0 w-px bg-ink/40" style={{ left: `${pace * 100}%` }} title="On pace today" />
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {behind && (
        <p className="rounded-lg bg-accent-soft/60 px-3 py-2 text-sm">
          <span className="font-medium">{subjectName(behind.subject)}</span> is behind this week by{" "}
          {formatMinutes(behind.behindBy)}. Worth a session soon.
        </p>
      )}
    </div>
  );
}
