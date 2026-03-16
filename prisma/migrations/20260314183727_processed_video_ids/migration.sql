-- DropForeignKey
ALTER TABLE "ProcessedVideo" DROP CONSTRAINT "ProcessedVideo_videoId_fkey";

-- AlterTable
ALTER TABLE "Video" ADD COLUMN     "processedVideos" TEXT[];
