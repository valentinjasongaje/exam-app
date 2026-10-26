-- AlterTable
ALTER TABLE "StudySession" ADD COLUMN "autoKey" TEXT,
ADD COLUMN "seconds" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "StudyVideo" ADD COLUMN "watchedBuckets" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "StudySession_userId_autoKey_key" ON "StudySession"("userId", "autoKey");
