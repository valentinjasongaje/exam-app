-- CreateEnum
CREATE TYPE "OverrideAction" AS ENUM ('SKIP', 'MOVE');

-- CreateEnum
CREATE TYPE "CalendarEventKind" AS ENUM ('EVENT', 'DEADLINE', 'BUSY');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "calendarToken" TEXT;

-- CreateTable
CREATE TABLE "ScheduleOverride" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "blockKey" TEXT NOT NULL,
    "action" "OverrideAction" NOT NULL,
    "newDate" DATE,
    "newStart" TEXT,
    "newEnd" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "start" TEXT,
    "end" TEXT,
    "title" TEXT NOT NULL,
    "kind" "CalendarEventKind" NOT NULL DEFAULT 'EVENT',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewReminder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "dueDate" DATE NOT NULL,
    "step" INTEGER NOT NULL,
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_calendarToken_key" ON "User"("calendarToken");

-- CreateIndex
CREATE INDEX "ScheduleOverride_userId_newDate_idx" ON "ScheduleOverride"("userId", "newDate");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleOverride_userId_date_blockKey_key" ON "ScheduleOverride"("userId", "date", "blockKey");

-- CreateIndex
CREATE INDEX "CalendarEvent_userId_date_idx" ON "CalendarEvent"("userId", "date");

-- CreateIndex
CREATE INDEX "ReviewReminder_userId_dueDate_idx" ON "ReviewReminder"("userId", "dueDate");

-- CreateIndex
CREATE INDEX "ReviewReminder_topicId_idx" ON "ReviewReminder"("topicId");

-- AddForeignKey
ALTER TABLE "ScheduleOverride" ADD CONSTRAINT "ScheduleOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewReminder" ADD CONSTRAINT "ReviewReminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewReminder" ADD CONSTRAINT "ReviewReminder_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "StudyTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
