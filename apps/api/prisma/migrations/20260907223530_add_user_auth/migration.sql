-- DropIndex
DROP INDEX "User_deviceId_key";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "deviceId",
ADD COLUMN     "email" TEXT NOT NULL,
ADD COLUMN     "name" TEXT NOT NULL,
ADD COLUMN     "passwordHash" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

