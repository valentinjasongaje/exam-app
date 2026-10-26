import type { VideoQuestion } from "@prisma/client";

/** What the notes panel needs to show and edit a video question. */
export type VQ = {
  id: string;
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
