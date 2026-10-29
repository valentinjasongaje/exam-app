-- CreateTable
CREATE TABLE "AllowedEmail" (
    "email" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AllowedEmail_pkey" PRIMARY KEY ("email")
);

-- CreateTable
CREATE TABLE "AccessRequest" (
    "email" TEXT NOT NULL,
    "name" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastTriedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessRequest_pkey" PRIMARY KEY ("email")
);

-- Everyone who already has an account keeps access (the admin can remove them later).
INSERT INTO "AllowedEmail" ("email")
SELECT DISTINCT lower("email") FROM "User"
ON CONFLICT DO NOTHING;
