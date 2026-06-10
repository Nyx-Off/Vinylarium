-- AlterTable
ALTER TABLE "artists" ADD COLUMN     "mbType" TEXT,
ADD COLUMN     "mbBeginDate" TEXT,
ADD COLUMN     "mbEndDate" TEXT,
ADD COLUMN     "relationsStatus" "ArtistOriginStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "relationsCheckedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "band_members" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "memberId" TEXT,
    "name" TEXT NOT NULL,
    "mbid" TEXT,
    "attributes" TEXT[],
    "beginDate" TEXT,
    "endDate" TEXT,
    "ended" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "band_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "artists_relationsStatus_idx" ON "artists"("relationsStatus");

-- CreateIndex
CREATE INDEX "band_members_groupId_idx" ON "band_members"("groupId");

-- CreateIndex
CREATE INDEX "band_members_memberId_idx" ON "band_members"("memberId");

-- AddForeignKey
ALTER TABLE "band_members" ADD CONSTRAINT "band_members_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "band_members" ADD CONSTRAINT "band_members_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "artists"("id") ON DELETE SET NULL ON UPDATE CASCADE;
