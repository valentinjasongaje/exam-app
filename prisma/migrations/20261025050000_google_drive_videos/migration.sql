-- AlterTable
ALTER TABLE "StudyVideo" ADD COLUMN     "driveFileId" TEXT,
ADD COLUMN     "driveUploadedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DriveConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "googleEmail" TEXT,
    "refreshTokenEnc" TEXT NOT NULL,
    "folderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriveConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DriveConnection_userId_key" ON "DriveConnection"("userId");

-- AddForeignKey
ALTER TABLE "DriveConnection" ADD CONSTRAINT "DriveConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
