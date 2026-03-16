-- CreateEnum
CREATE TYPE "ValidationStatus" AS ENUM ('PENDING', 'VALID', 'INVALID');

-- CreateTable
CREATE TABLE "Video" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "codec" TEXT,
    "duration" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "validationStatus" "ValidationStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "Video_pkey" PRIMARY KEY ("id")
);
