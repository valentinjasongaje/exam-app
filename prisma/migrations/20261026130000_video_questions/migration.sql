-- CreateTable
CREATE TABLE "VideoQuestion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "seconds" INTEGER,
    "text" TEXT NOT NULL,
    "choiceA" TEXT NOT NULL DEFAULT '',
    "choiceB" TEXT NOT NULL DEFAULT '',
    "choiceC" TEXT NOT NULL DEFAULT '',
    "choiceD" TEXT NOT NULL DEFAULT '',
    "correct" TEXT,
    "explanation" TEXT,
    "imageUrl" TEXT,
    "questionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VideoQuestion_questionId_key" ON "VideoQuestion"("questionId");
CREATE INDEX "VideoQuestion_userId_videoId_idx" ON "VideoQuestion"("userId", "videoId");
CREATE INDEX "VideoQuestion_userId_subject_idx" ON "VideoQuestion"("userId", "subject");

-- AddForeignKey
ALTER TABLE "VideoQuestion" ADD CONSTRAINT "VideoQuestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VideoQuestion" ADD CONSTRAINT "VideoQuestion_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "StudyVideo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VideoQuestion" ADD CONSTRAINT "VideoQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE SET NULL ON UPDATE CASCADE;
