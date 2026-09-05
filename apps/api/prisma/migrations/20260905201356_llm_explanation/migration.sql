-- CreateTable
CREATE TABLE "LLMExplanation" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "explanationText" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LLMExplanation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LLMExplanation_batchId_idx" ON "LLMExplanation"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "LLMExplanation_batchId_modelId_modelVersion_key" ON "LLMExplanation"("batchId", "modelId", "modelVersion");

-- AddForeignKey
ALTER TABLE "LLMExplanation" ADD CONSTRAINT "LLMExplanation_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "TestBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
