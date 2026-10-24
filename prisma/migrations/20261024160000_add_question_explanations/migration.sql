-- CreateTable
CREATE TABLE "QuestionExplanation" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "choiceKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionExplanation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuestionExplanation_userId_createdAt_idx" ON "QuestionExplanation"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionExplanation_questionId_choiceKey_key" ON "QuestionExplanation"("questionId", "choiceKey");

-- AddForeignKey
ALTER TABLE "QuestionExplanation" ADD CONSTRAINT "QuestionExplanation_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionExplanation" ADD CONSTRAINT "QuestionExplanation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
