/**
 * Shared upsert logic for loading one parsed exam (see lib/exam-parser.js)
 * into the database. Used by both scripts/seed.js (CLI, bulk-loads
 * data/parsed/*.json) and the admin web-upload import flow (loads one
 * freshly-parsed exam right after upload). Takes a Prisma client instance
 * rather than importing one, so callers can use whichever client fits
 * their context (a short-lived CLI client vs. the app's shared singleton).
 *
 * Expects `examData.questions[].imageUrl` / `explanationImageUrl` to
 * already be resolved to their final string form (a local relative path
 * for the CLI, a Vercel Blob URL for the web upload flow) — this module
 * doesn't know or care how images are persisted.
 */

async function seedExam(prisma, examData) {
  const { subject, exam, questions } = examData;

  const subjectRow = await prisma.subject.upsert({
    where: { slug: subject.slug },
    update: { name: subject.name },
    create: { name: subject.name, slug: subject.slug },
  });

  const examRow = await prisma.exam.upsert({
    where: { slug: exam.slug },
    update: {
      title: exam.title,
      subjectId: subjectRow.id,
      sourceFile: exam.sourceFile,
      sourceTag: exam.sourceTag,
    },
    create: {
      title: exam.title,
      slug: exam.slug,
      subjectId: subjectRow.id,
      sourceFile: exam.sourceFile,
      sourceTag: exam.sourceTag,
    },
  });

  for (const q of questions) {
    const questionRow = await prisma.question.upsert({
      where: {
        examId_sourceItemId: {
          examId: examRow.id,
          sourceItemId: q.sourceItemId,
        },
      },
      update: {
        order: q.order,
        text: q.text,
        imageUrl: q.imageUrl,
        explanation: q.explanation,
        explanationImageUrl: q.explanationImageUrl,
      },
      create: {
        examId: examRow.id,
        order: q.order,
        text: q.text,
        imageUrl: q.imageUrl,
        explanation: q.explanation,
        explanationImageUrl: q.explanationImageUrl,
        sourceItemId: q.sourceItemId,
      },
    });

    for (const c of q.choices) {
      await prisma.choice.upsert({
        where: {
          questionId_label: {
            questionId: questionRow.id,
            label: c.label,
          },
        },
        update: { text: c.text, isCorrect: c.isCorrect },
        create: {
          questionId: questionRow.id,
          label: c.label,
          text: c.text,
          isCorrect: c.isCorrect,
        },
      });
    }
  }

  return { subject: subjectRow.name, exam: examRow.title, questionCount: questions.length };
}

module.exports = { seedExam };
