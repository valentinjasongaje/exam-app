-- CreateEnum
CREATE TYPE "AttemptLayout" AS ENUM ('ALL_AT_ONCE', 'ONE_AT_A_TIME');

-- AlterTable
ALTER TABLE "Attempt" ADD COLUMN     "layout" "AttemptLayout" NOT NULL DEFAULT 'ALL_AT_ONCE',
ADD COLUMN     "shuffleSeed" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "preferredLayout" "AttemptLayout" NOT NULL DEFAULT 'ALL_AT_ONCE',
ADD COLUMN     "shuffleEnabled" BOOLEAN NOT NULL DEFAULT true;
