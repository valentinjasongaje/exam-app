-- CreateEnum
CREATE TYPE "AttemptMode" AS ENUM ('PRACTICE', 'BOARD_EXAM');

-- AlterTable
ALTER TABLE "Attempt" ADD COLUMN     "mode" "AttemptMode" NOT NULL DEFAULT 'PRACTICE',
ADD COLUMN     "timeLimitMinutes" INTEGER;
