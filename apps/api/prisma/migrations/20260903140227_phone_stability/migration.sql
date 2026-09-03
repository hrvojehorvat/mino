-- AlterEnum
ALTER TYPE "TestType" ADD VALUE 'PhoneStability';

-- CreateTable
CREATE TABLE "SensorSession" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "samples" JSONB NOT NULL,

    CONSTRAINT "SensorSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SensorSession_sessionId_key" ON "SensorSession"("sessionId");

-- AddForeignKey
ALTER TABLE "SensorSession" ADD CONSTRAINT "SensorSession_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TestSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
