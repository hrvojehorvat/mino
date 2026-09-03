-- AlterEnum
ALTER TYPE "TestType" ADD VALUE 'FingerTracing';

-- AlterEnum
ALTER TYPE "TouchEventType" ADD VALUE 'TouchMove';

-- AlterTable
ALTER TABLE "TestSession" ADD COLUMN     "testParams" JSONB;
