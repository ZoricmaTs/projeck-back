/*
  Warnings:

  - You are about to drop the column `processedVideos` on the `Video` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Video" DROP COLUMN "processedVideos";

-- AddForeignKey
ALTER TABLE "ProcessedVideo" ADD CONSTRAINT "ProcessedVideo_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
