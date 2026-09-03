-- CreateTable
CREATE TABLE "MLResult" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "metrics" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MLResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MLResult_sessionId_idx" ON "MLResult"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "MLResult_sessionId_modelId_modelVersion_key" ON "MLResult"("sessionId", "modelId", "modelVersion");

-- AddForeignKey
ALTER TABLE "MLResult" ADD CONSTRAINT "MLResult_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TestSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
