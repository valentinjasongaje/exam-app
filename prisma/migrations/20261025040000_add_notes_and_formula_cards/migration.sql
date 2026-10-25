-- CreateTable
CREATE TABLE "StudyNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudyNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormulaCard" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "formula" TEXT NOT NULL,
    "hint" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "box" INTEGER NOT NULL DEFAULT 0,
    "dueDate" DATE,
    "lastReviewedAt" TIMESTAMP(3),
    "correct" INTEGER NOT NULL DEFAULT 0,
    "wrong" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormulaCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudyNote_userId_subject_idx" ON "StudyNote"("userId", "subject");

-- CreateIndex
CREATE INDEX "FormulaCard_userId_dueDate_idx" ON "FormulaCard"("userId", "dueDate");

-- CreateIndex
CREATE INDEX "FormulaCard_noteId_idx" ON "FormulaCard"("noteId");

-- AddForeignKey
ALTER TABLE "StudyNote" ADD CONSTRAINT "StudyNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormulaCard" ADD CONSTRAINT "FormulaCard_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "StudyNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormulaCard" ADD CONSTRAINT "FormulaCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
