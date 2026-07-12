-- DropForeignKey
ALTER TABLE "Attempt" DROP CONSTRAINT "Attempt_examId_fkey";

-- AlterTable
ALTER TABLE "Attempt" ADD COLUMN     "questionIds" JSONB,
ADD COLUMN     "showFeedback" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "subjectId" TEXT,
ALTER COLUMN "examId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "instantFeedback" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Attempt_userId_subjectId_idx" ON "Attempt"("userId", "subjectId");

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
