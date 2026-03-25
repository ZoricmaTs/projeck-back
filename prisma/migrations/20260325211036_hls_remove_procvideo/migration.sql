/*
  Warnings:

  - You are about to drop the `ProcessedVideo` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ProcessedVideo" DROP CONSTRAINT "ProcessedVideo_videoId_fkey";

-- DropTable
DROP TABLE "ProcessedVideo";
