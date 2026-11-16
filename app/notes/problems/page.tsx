import { Calculator } from "lucide-react";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isTrackerSubject, subjectName, toDbDate, todayLocal } from "@/lib/study-plan";
import { PageHeader, EmptyState } from "@/components/ui";
import { shuffleCards } from "@/lib/shuffle-cards";
import { baseTitle, sameLecture } from "@/lib/video-parts";
import ProblemSession from "./problem-session";

/**
 * Practice for problems worked in the review videos: read the problem, solve
 * it on paper, reveal the answer (and the board), be honest. Same spacing as
 * formula recall.
 *
 * /notes/problems                 due problems, all subjects (&all=1 for all)
 * /notes/problems?subject=elex    due problems in a subject
 * /notes/problems?video=<id>      every solved problem and multiple-choice
 *                                 question from one video's lecture
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

  // "From one video" means that video's whole lecture: its other parts' problems are included.
  const from = p.video ? await prisma.studyVideo.findFirst({ where: { id: p.video, userId }, select: { subject: true, title: true } }) : null;
  const lectureVideos = from ? { video: { is: { userId, subject: from.subject, ...sameLecture(from.title) } } } : p.video ? { videoId: p.video } : {};

  const rows = await prisma.videoQuestion.findMany({
    where: {
      userId,
      // A lecture's practice also includes its multiple-choice questions (with an answer picked).
      OR: p.video ? [{ kind: "solve", answer: { not: null } }, { kind: "mcq", correct: { not: null } }] : [{ kind: "solve", answer: { not: null } }],
      ...lectureVideos,
      ...(subject ? { subject } : {}),
      ...(dueOnly ? { OR: [{ dueDate: null }, { dueDate: { lte: today } }] } : {}),
    },
    include: { video: { select: { title: true } } },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
  });

  const LABELS = ["A", "B", "C", "D"] as const;
  const choicesOf = (q: (typeof rows)[number]) => {
    const texts = [q.choiceA, q.choiceB, q.choiceC, q.choiceD].map((t) => t.trim());
    return q.kind === "mcq" && q.correct && texts.every(Boolean) ? LABELS.map((label, k) => ({ label, text: texts[k] })) : null;
  };
  // Multiple-choice drafts without all four choices can't be practised yet.
  const usable = rows.filter((q) => q.kind === "solve" || choicesOf(q));
  const hasMcq = usable.some((q) => q.kind === "mcq");

  const scope = p.video
    ? from
      ? baseTitle(from.title)
      : "This video"
    : `${subject ? subjectName(subject) : "All subjects"} · ${dueOnly ? "due today" : "all problems"}`;
  const backHref = p.video ? `/watch/${p.video}` : `/notes${subject ? `?subject=${subject}` : ""}`;

  return (
    <>
      <Link href={backHref} className="text-sm text-ink-muted hover:text-ink">
        ← {p.video ? "Back to the video" : "Notes"}
      </Link>
      <PageHeader
        icon={Calculator}
        eyebrow={hasMcq ? "Lecture questions" : "Solved problems"}
        title={scope}
        subtitle={
          hasMcq
            ? "Solved problems: work it out, reveal and be honest. Multiple choice: pick an answer and see right away."
            : "Solve it on paper first, then reveal the answer and be honest."
        }
      />
      {usable.length === 0 ? (
        <EmptyState>
          {dueOnly ? (
            <>
              Nothing due.{" "}
              <Link href={`/notes/problems?${subject ? `subject=${subject}&` : ""}all=1`} className="text-accent hover:underline">
                Practise everything anyway
              </Link>
            </>
          ) : (
            "No questions to practise yet. While watching, use Add question, and add the answer."
          )}
        </EmptyState>
      ) : (
        <ProblemSession
          backHref={backHref}
          problems={shuffleCards(usable).map((q) => ({
            id: q.id,
            text: q.text,
            imageUrl: q.imageUrl,
            answer: q.answer ?? "",
            choices: choicesOf(q),
            correct: q.correct,
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
