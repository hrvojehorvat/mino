-- CreateTable
CREATE TABLE "TestBatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TestBatch_userId_idx" ON "TestBatch"("userId");

-- AddForeignKey
ALTER TABLE "TestBatch" ADD CONSTRAINT "TestBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: every pre-existing TestSession predates the concept of a batch.
-- Give each user with existing sessions one "Legacy sessions" batch and
-- attach their old sessions to it, rather than losing that data.
INSERT INTO "TestBatch" ("id", "userId", "name")
SELECT 'legacy-' || u."id", u."id", 'Legacy sessions'
FROM "User" u
WHERE EXISTS (SELECT 1 FROM "TestSession" ts WHERE ts."userId" = u."id");

-- AlterTable
ALTER TABLE "TestSession" ADD COLUMN "batchId" TEXT;

UPDATE "TestSession" SET "batchId" = 'legacy-' || "userId";

ALTER TABLE "TestSession" ALTER COLUMN "batchId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "TestSession_batchId_idx" ON "TestSession"("batchId");

-- AddForeignKey
ALTER TABLE "TestSession" ADD CONSTRAINT "TestSession_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "TestBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
