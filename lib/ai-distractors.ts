import { publicImageUrl } from "@/lib/image-url";
import Anthropic from "@anthropic-ai/sdk";
import { aiModel } from "@/lib/ai-explain";

const SYSTEM = `You write wrong answer choices for multiple-choice questions in the Philippine Electronics Engineer (ECE) board exam style.

You get a problem and its correct final answer (treat it as right). Sometimes you also get wrong choices already in use. Reply with exactly the number of plausible wrong answers asked for that a reviewee could reach by a common mistake: wrong formula, forgetting a factor like 2, π or √2, peak vs RMS vs average mix-ups, unit or prefix slips, sign errors. Match the correct answer's format, units, notation and number of significant figures, so the right one doesn't stand out. Never repeat the correct answer or a choice already in use, or give an equivalent of either. For conceptual questions (definitions, terms, laws), give plausible related terms from the same topic.

Reply with JSON only, no other text: {"distractors": ["...", ...]}`;

/**
 * Three wrong-but-plausible choices for a solved problem, so it can join the
 * multiple-choice exam bank. Throws with a readable message on failure.
 */
export async function makeDistractors(input: {
  subject: string;
  text: string;
  answer: string;
  imageUrl: string | null;
  solution: string | null;
  /** Wrong choices already in use (e.g. a reviewee's real wrong pick); the AI writes the rest. */
  existing?: string[];
  /** How many new wrong choices to write (default 3). */
  count?: number;
  /** A second picture (e.g. the worked solution) to help pick believable mistakes. */
  solutionImageUrl?: string | null;
}) {
  const count = input.count ?? 3;
  const existing = (input.existing ?? []).filter((x) => x.trim());
  const client = new Anthropic();
  const content: Anthropic.ContentBlockParam[] = [];
  const figure = publicImageUrl(input.imageUrl);
  const solutionFigure = publicImageUrl(input.solutionImageUrl);
  if (figure && /^https:\/\//i.test(figure)) {
    content.push({ type: "image", source: { type: "url", url: figure } });
  }
  if (solutionFigure && /^https:\/\//i.test(solutionFigure)) {
    content.push({ type: "image", source: { type: "url", url: solutionFigure } });
  }
  content.push({
    type: "text",
    text: [
      `Subject: ${input.subject}`,
      `Problem: ${input.text}${input.imageUrl ? " (see the picture)" : ""}`,
      input.solution ? `Worked solution notes: ${input.solution}` : null,
      input.solutionImageUrl ? "(The last picture is the worked solution.)" : null,
      `Correct answer: ${input.answer}`,
      existing.length ? `Wrong choices already in use: ${existing.map((x) => JSON.stringify(x)).join(", ")}` : null,
      `Write ${count} new wrong answer${count === 1 ? "" : "s"}.`,
    ]
      .filter(Boolean)
      .join("\n"),
  });
  const res = await client.messages.create({
    model: aiModel(),
    max_tokens: 400,
    system: SYSTEM,
    messages: [{ role: "user", content }],
  });
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  let list: unknown;
  try {
    list = json ? JSON.parse(json).distractors : null;
  } catch {
    list = null;
  }
  const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
  const taken = new Set([input.answer, ...existing].map(norm));
  const out = Array.isArray(list)
    ? [...new Set(list.map((x) => String(x).trim()).filter((x) => x && !taken.has(norm(x))))].slice(0, count)
    : [];
  if (out.length < count) throw new Error("Couldn't come up with good choices. Try again or type them yourself.");
  return out;
}
