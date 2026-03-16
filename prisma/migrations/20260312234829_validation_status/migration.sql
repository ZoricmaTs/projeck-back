-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ValidationStatus" ADD VALUE 'QUEUED';
ALTER TYPE "ValidationStatus" ADD VALUE 'PROCESSING';
ALTER TYPE "ValidationStatus" ADD VALUE 'READY';
ALTER TYPE "ValidationStatus" ADD VALUE 'FAILED';

-- CreateTable
CREATE TABLE "ProcessedVideo" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "codec" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "duration" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedVideo_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ProcessedVideo" ADD CONSTRAINT "ProcessedVideo_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
