-- AlterTable
ALTER TABLE "Attempt" ADD COLUMN "label" TEXT;

-- CreateTable
CREATE TABLE "MistakeCard" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "dueDate" DATE,
    "timesWrong" INTEGER NOT NULL DEFAULT 1,
    "timesRight" INTEGER NOT NULL DEFAULT 0,
    "lastReviewedAt" TIMESTAMP(3),
    "masteredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MistakeCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MistakeCard_userId_questionId_key" ON "MistakeCard"("userId", "questionId");
CREATE INDEX "MistakeCard_userId_masteredAt_dueDate_idx" ON "MistakeCard"("userId", "masteredAt", "dueDate");

-- AddForeignKey
ALTER TABLE "MistakeCard" ADD CONSTRAINT "MistakeCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MistakeCard" ADD CONSTRAINT "MistakeCard_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: questions whose most recent answer (in a finished attempt) was wrong start in the bank, due now.
INSERT INTO "MistakeCard" ("id", "userId", "questionId", "timesWrong", "dueDate")
SELECT
  'mb' || replace(gen_random_uuid()::text, '-', ''),
  latest."userId",
  latest."questionId",
  wrongs.n,
  NULL
FROM (
  SELECT DISTINCT ON (a."userId", aa."questionId") a."userId", aa."questionId", aa."isCorrect", aa."choiceId"
  FROM "AttemptAnswer" aa
  JOIN "Attempt" a ON a."id" = aa."attemptId"
  WHERE a."finishedAt" IS NOT NULL
  ORDER BY a."userId", aa."questionId", aa."answeredAt" DESC
) latest
JOIN (
  SELECT a."userId", aa."questionId", COUNT(*)::int AS n
  FROM "AttemptAnswer" aa
  JOIN "Attempt" a ON a."id" = aa."attemptId"
  WHERE a."finishedAt" IS NOT NULL AND aa."isCorrect" = false AND aa."choiceId" IS NOT NULL
  GROUP BY a."userId", aa."questionId"
) wrongs ON wrongs."userId" = latest."userId" AND wrongs."questionId" = latest."questionId"
WHERE latest."isCorrect" = false AND latest."choiceId" IS NOT NULL;
