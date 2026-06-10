-- CreateEnum
CREATE TYPE "ArtistOriginStatus" AS ENUM ('PENDING', 'FOUND', 'NOT_FOUND', 'FAILED');

-- AlterTable
ALTER TABLE "artists" ADD COLUMN     "mbid" TEXT,
ADD COLUMN     "originCheckedAt" TIMESTAMP(3),
ADD COLUMN     "originStatus" "ArtistOriginStatus" NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX "artists_originStatus_idx" ON "artists"("originStatus");
