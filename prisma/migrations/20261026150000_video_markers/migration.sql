-- CreateTable
CREATE TABLE "VideoMarker" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "seconds" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoMarker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VideoMarker_userId_videoId_idx" ON "VideoMarker"("userId", "videoId");

-- AddForeignKey
ALTER TABLE "VideoMarker" ADD CONSTRAINT "VideoMarker_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VideoMarker" ADD CONSTRAINT "VideoMarker_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "StudyVideo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
