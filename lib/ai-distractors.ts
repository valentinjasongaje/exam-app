import Anthropic from "@anthropic-ai/sdk";
import { aiModel } from "@/lib/ai-explain";

const SYSTEM = `You write wrong answer choices for multiple-choice questions in the Philippine Electronics Engineer (ECE) board exam style.

You get a problem and its correct final answer (treat it as right). Reply with exactly three plausible wrong answers that a reviewee could reach by a common mistake: wrong formula, forgetting a factor like 2, π or √2, peak vs RMS vs average mix-ups, unit or prefix slips, sign errors. Match the correct answer's format, units, notation and number of significant figures, so the right one doesn't stand out. Never repeat the correct answer or give an equivalent of it.

Reply with JSON only, no other text: {"distractors": ["...", "...", "..."]}`;

/**
 * Three wrong-but-plausible choices for a solved problem, so it can join the
 * multiple-choice exam bank. Throws with a readable message on failure.
 */
export async function makeDistractors(input: { subject: string; text: string; answer: string; imageUrl: string | null; solution: string | null }) {
  const client = new Anthropic();
  const content: Anthropic.ContentBlockParam[] = [];
  if (input.imageUrl && /^https:\/\//i.test(input.imageUrl)) {
    content.push({ type: "image", source: { type: "url", url: input.imageUrl } });
  }
  content.push({
    type: "text",
    text: [
      `Subject: ${input.subject}`,
      `Problem: ${input.text}${input.imageUrl ? " (see the picture)" : ""}`,
      input.solution ? `Worked solution notes: ${input.solution}` : null,
      `Correct answer: ${input.answer}`,
    ]
      .filter(Boolean)
      .join("\n"),
  });
  const res = await client.messages.create({
    model: aiModel(),
    max_tokens: 300,
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
  const out = Array.isArray(list)
    ? [...new Set(list.map((x) => String(x).trim()).filter((x) => x && norm(x) !== norm(input.answer)))].slice(0, 3)
    : [];
  if (out.length < 3) throw new Error("Couldn't come up with good choices. Try again or type them yourself.");
  return out;
}
