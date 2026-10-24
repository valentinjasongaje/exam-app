import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { questionIdsOf } from "@/lib/composed-attempt";
import {
  EXPLAIN_SYSTEM,
  aiConfigured,
  aiDailyLimit,
  aiModel,
  buildExplainMessage,
} from "@/lib/ai-explain";

/**
 * POST { attemptId, questionId } → plain-text explanation, streamed.
 * Cached per (question, picked choice); cache hits are free and don't count
 * toward the daily limit. The API key stays on the server.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function text(body: string, status: number) {
  return new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return text("Please log in again.", 401);
  if (!aiConfigured()) return text("AI explanations aren't set up yet (missing ANTHROPIC_API_KEY).", 503);
  const userId = session.user.id;

  let attemptId: string, questionId: string;
  try {
    const body = await req.json();
    attemptId = String(body.attemptId ?? "");
    questionId = String(body.questionId ?? "");
  } catch {
    return text("Bad request.", 400);
  }

  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    select: { userId: true, finishedAt: true, examId: true, questionIds: true },
  });
  if (!attempt || attempt.userId !== userId || !attempt.finishedAt) return text("Attempt not found.", 404);

  const composed = questionIdsOf(attempt);
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    include: { choices: { orderBy: { label: "asc" } }, exam: { include: { subject: true } } },
  });
  const inAttempt = composed ? composed.includes(questionId) : question?.examId === attempt.examId;
  if (!question || !inAttempt) return text("Question not found in this attempt.", 404);

  const answer = await prisma.attemptAnswer.findUnique({
    where: { attemptId_questionId: { attemptId, questionId } },
    select: { choiceId: true },
  });
  const choiceKey = answer?.choiceId ?? "skipped";

  const cached = await prisma.questionExplanation.findUnique({
    where: { questionId_choiceKey: { questionId, choiceKey } },
  });
  if (cached) {
    return new Response(cached.content, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "X-Explanation-Cached": "1" },
    });
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const used = await prisma.questionExplanation.count({ where: { userId, createdAt: { gte: since } } });
  if (used >= aiDailyLimit()) {
    return text(`You've used today's ${aiDailyLimit()} AI explanations. They reset over the next 24 hours.`, 429);
  }

  const picked = question.choices.find((c) => c.id === answer?.choiceId);
  const message = buildExplainMessage({
    subject: question.exam.subject.name,
    text: question.text,
    imageUrl: question.imageUrl,
    explanation: question.explanation,
    explanationImageUrl: question.explanationImageUrl,
    choices: question.choices.map((c) => ({ label: c.label, text: c.text, isCorrect: c.isCorrect })),
    pickedLabel: picked?.label ?? null,
  });

  const model = aiModel();
  const client = new Anthropic();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = "";
      try {
        const response = client.messages.stream({
          model,
          max_tokens: 1024,
          system: EXPLAIN_SYSTEM,
          messages: [message],
        });
        response.on("text", (delta) => {
          full += delta;
          controller.enqueue(encoder.encode(delta));
        });
        const final = await response.finalMessage();

        if (final.stop_reason === "end_turn" && full.trim()) {
          await prisma.questionExplanation.upsert({
            where: { questionId_choiceKey: { questionId, choiceKey } },
            create: { questionId, choiceKey, userId, content: full.trim(), model },
            update: {},
          });
        } else if (final.stop_reason === "max_tokens") {
          controller.enqueue(encoder.encode("\n\n[Cut off — tap Regenerate to try again.]"));
        }
      } catch (err) {
        console.error("explain failed", err);
        const msg =
          err instanceof Anthropic.APIError && err.status === 401
            ? "The Anthropic API key was rejected — check ANTHROPIC_API_KEY in Vercel."
            : err instanceof Anthropic.APIError && err.status === 429
              ? "Claude is rate-limited right now. Try again in a minute."
              : "Couldn't get an explanation right now. Try again.";
        controller.enqueue(encoder.encode(`${full ? "\n\n" : ""}[${msg}]`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** DELETE { attemptId, questionId } → drop the cached explanation so the next request regenerates it. */
export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user) return text("Please log in again.", 401);
  let attemptId: string, questionId: string;
  try {
    const body = await req.json();
    attemptId = String(body.attemptId ?? "");
    questionId = String(body.questionId ?? "");
  } catch {
    return text("Bad request.", 400);
  }
  const attempt = await prisma.attempt.findFirst({
    where: { id: attemptId, userId: session.user.id },
    select: { id: true },
  });
  if (!attempt) return text("Attempt not found.", 404);
  const answer = await prisma.attemptAnswer.findUnique({
    where: { attemptId_questionId: { attemptId, questionId } },
    select: { choiceId: true },
  });
  await prisma.questionExplanation.deleteMany({
    where: { questionId, choiceKey: answer?.choiceId ?? "skipped" },
  });
  return new Response(null, { status: 204 });
}
