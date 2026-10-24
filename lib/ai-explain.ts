import type Anthropic from "@anthropic-ai/sdk";

/**
 * Prompt for the "Explain this" button on the attempt review page.
 *
 * The answer key and the reviewer's own solution are passed in as
 * authoritative, so Claude explains toward the known answer instead of
 * re-solving from scratch — engineering computations are exactly where a
 * fresh solve is most likely to slip.
 */

export const DEFAULT_AI_MODEL = "claude-sonnet-5-5";
export const DEFAULT_DAILY_LIMIT = 40;

export function aiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function aiModel() {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_AI_MODEL;
}

export function aiDailyLimit() {
  const n = Number(process.env.AI_DAILY_LIMIT);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_DAILY_LIMIT;
}

export const EXPLAIN_SYSTEM = `You are a patient tutor helping a reviewee prepare for the Philippine Electronics Engineer (ECE) licensure exam.

You will get one multiple-choice question from a review center's question bank, the official answer key, the reviewee's choice, and (when available) the review center's own solution. Treat the answer key and the provided solution as authoritative. Do not re-derive a different answer. If the key genuinely looks wrong or the question is ambiguous, say so in one sentence at the end instead of forcing an argument.

Write the explanation like this:
1. Start with one sentence naming the concept or formula the question tests.
2. Show a short worked solution that reaches the correct answer. For computations, show the formula, substitute values with units, and give the result.
3. If the reviewee picked a wrong answer, explain the likely mistake behind that specific choice (wrong formula, unit slip, misread term, common distractor). If they skipped it, say what to recognize next time to get started.
4. End with one line starting "Remember:" giving a formula, rule or shortcut worth memorizing.

Keep it under 250 words. Use plain text only: no Markdown headings, bold, tables or LaTeX. Write math inline in plain notation such as Xc = 1 / (2*pi*f*C) and use ^ for powers. Short paragraphs are fine.`;

type QuestionInput = {
  subject: string | null;
  text: string;
  imageUrl: string | null;
  explanation: string | null;
  explanationImageUrl: string | null;
  choices: { label: string; text: string; isCorrect: boolean }[];
  pickedLabel: string | null; // null = skipped
};

function isRemoteImage(url: string | null): url is string {
  return !!url && /^https:\/\//i.test(url);
}

export function buildExplainMessage(q: QuestionInput): Anthropic.MessageParam {
  const correct = q.choices.find((c) => c.isCorrect);
  const picked = q.pickedLabel ? q.choices.find((c) => c.label === q.pickedLabel) : null;

  const lines = [
    q.subject ? `Subject: ${q.subject}` : null,
    "",
    "Question:",
    q.text,
    "",
    "Choices:",
    ...q.choices.map((c) => `${c.label}. ${c.text}`),
    "",
    `Answer key: ${correct ? `${correct.label}. ${correct.text}` : "(not marked)"}`,
    picked
      ? `Reviewee's answer: ${picked.label}. ${picked.text}${picked.isCorrect ? " (correct)" : " (wrong)"}`
      : "Reviewee's answer: skipped",
    "",
    q.explanation ? `Review center's solution:\n${q.explanation}` : "Review center's solution: (none provided)",
  ].filter((l) => l !== null);

  const content: Anthropic.ContentBlockParam[] = [];
  if (isRemoteImage(q.imageUrl)) {
    content.push({ type: "text", text: "Figure for the question:" });
    content.push({ type: "image", source: { type: "url", url: q.imageUrl } });
  }
  if (isRemoteImage(q.explanationImageUrl)) {
    content.push({ type: "text", text: "Figure from the review center's solution:" });
    content.push({ type: "image", source: { type: "url", url: q.explanationImageUrl } });
  }
  content.push({ type: "text", text: lines.join("\n") });

  return { role: "user", content };
}
