import type { VideoQuestion } from "@prisma/client";

/** What the notes panel needs to show and edit a video question. */
export type VQ = {
  id: string;
  /** The video (part) the question was asked in; its `seconds` are a time in that part. */
  videoId: string;
  /** Which part that is ("Part 3", "V2 · Part 5"). Set by the watch page, kept by the panel across saves. */
  partLabel?: string | null;
  /** Position of that part within the lecture, for ordering across parts. */
  partOrder?: number;
  kind: "mcq" | "solve";
  seconds: number | null;
  text: string;
  choices: { A: string; B: string; C: string; D: string };
  correct: string | null;
  answer: string;
  explanation: string;
  imageUrl: string | null;
  solutionImageUrl: string | null;
  inBank: boolean;
};

export function toClient(q: VideoQuestion): VQ {
  return {
    id: q.id,
    videoId: q.videoId,
    kind: q.kind === "solve" ? "solve" : "mcq",
    seconds: q.seconds,
    text: q.text,
    choices: { A: q.choiceA, B: q.choiceB, C: q.choiceC, D: q.choiceD },
    correct: q.correct,
    answer: q.answer ?? "",
    explanation: q.explanation ?? "",
    imageUrl: q.imageUrl,
    solutionImageUrl: q.solutionImageUrl,
    inBank: !!q.questionId,
  };
}
