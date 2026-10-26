import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isTrackerSubject, subjectName, toDbDate, todayLocal } from "@/lib/study-plan";
import { PageHeader, EmptyState } from "@/components/ui";
import { shuffleCards } from "@/lib/shuffle-cards";
import ProblemSession from "./problem-session";

/**
 * Practice for problems worked in the review videos: read the problem, solve
 * it on paper, reveal the answer (and the board), be honest. Same spacing as
 * formula recall.
 *
 * /notes/problems                 due problems, all subjects (&all=1 for all)
 * /notes/problems?subject=elex    due problems in a subject
 * /notes/problems?video=<id>      every solved problem from one video
 */
export default async function ProblemsPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string; video?: string; all?: string }>;
}) {
  const session = await auth();
  const userId = session!.user.id;
  const p = await searchParams;
  const subject = isTrackerSubject(p.subject) ? p.subject : null;
  const dueOnly = !p.video && p.all !== "1";
  const today = toDbDate(todayLocal());

  const rows = await prisma.videoQuestion.findMany({
    where: {
      userId,
      kind: "solve",
      answer: { not: null },
      ...(p.video ? { videoId: p.video } : {}),
      ...(subject ? { subject } : {}),
      ...(dueOnly ? { OR: [{ dueDate: null }, { dueDate: { lte: today } }] } : {}),
    },
    include: { video: { select: { title: true } } },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
  });

  const scope = p.video
    ? rows[0]?.video.title ?? "This video"
    : `${subject ? subjectName(subject) : "All subjects"} · ${dueOnly ? "due today" : "all problems"}`;
  const backHref = p.video ? `/watch/${p.video}` : `/notes${subject ? `?subject=${subject}` : ""}`;

  return (
    <>
      <Link href={backHref} className="text-sm text-ink-muted hover:text-ink">
        ← {p.video ? "Back to the video" : "Notes"}
      </Link>
      <PageHeader eyebrow="Solved problems" title={scope} subtitle="Solve it on paper first, then reveal the answer and be honest." />
      {rows.length === 0 ? (
        <EmptyState>
          {dueOnly ? (
            <>
              Nothing due.{" "}
              <Link href={`/notes/problems?${subject ? `subject=${subject}&` : ""}all=1`} className="text-accent hover:underline">
                Practise everything anyway
              </Link>
            </>
          ) : (
            "No solved problems yet. While watching, use Add question → Solved problem, and add the final answer."
          )}
        </EmptyState>
      ) : (
        <ProblemSession
          backHref={backHref}
          problems={shuffleCards(rows).map((q) => ({
            id: q.id,
            text: q.text,
            imageUrl: q.imageUrl,
            answer: q.answer!,
            solutionImageUrl: q.solutionImageUrl,
            explanation: q.explanation,
            topic: q.topic,
            videoId: q.videoId,
            seconds: q.seconds,
          }))}
        />
      )}
    </>
  );
}
