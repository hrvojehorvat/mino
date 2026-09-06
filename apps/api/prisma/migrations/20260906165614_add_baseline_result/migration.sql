-- CreateTable
CREATE TABLE "BaselineResult" (
    "id" TEXT NOT NULL,
    "mlResultId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "baselineSampleSize" INTEGER NOT NULL,
    "metrics" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BaselineResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BaselineResult_mlResultId_idx" ON "BaselineResult"("mlResultId");

-- CreateIndex
CREATE UNIQUE INDEX "BaselineResult_mlResultId_modelId_modelVersion_key" ON "BaselineResult"("mlResultId", "modelId", "modelVersion");

-- AddForeignKey
ALTER TABLE "BaselineResult" ADD CONSTRAINT "BaselineResult_mlResultId_fkey" FOREIGN KEY ("mlResultId") REFERENCES "MLResult"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
