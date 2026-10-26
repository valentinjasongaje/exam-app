import type { VideoQuestion } from "@prisma/client";

/** What the notes panel needs to show and edit a video question. */
export type VQ = {
  id: string;
  seconds: number | null;
  text: string;
  choices: { A: string; B: string; C: string; D: string };
  correct: string | null;
  explanation: string;
  imageUrl: string | null;
  inBank: boolean;
};

export function toClient(q: VideoQuestion): VQ {
  return {
    id: q.id,
    seconds: q.seconds,
    text: q.text,
    choices: { A: q.choiceA, B: q.choiceB, C: q.choiceC, D: q.choiceD },
    correct: q.correct,
    explanation: q.explanation ?? "",
    imageUrl: q.imageUrl,
    inBank: !!q.questionId,
  };
}
