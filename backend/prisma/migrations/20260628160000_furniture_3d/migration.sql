-- 3D storage editor: furniture pieces placed in a room, whose compartments are
-- the cells records get assigned to.

-- CreateTable
CREATE TABLE "furniture" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "posX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "posZ" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "width" DOUBLE PRECISION NOT NULL DEFAULT 0.77,
    "height" DOUBLE PRECISION NOT NULL DEFAULT 0.77,
    "depth" DOUBLE PRECISION NOT NULL DEFAULT 0.39,
    "columns" INTEGER NOT NULL DEFAULT 2,
    "rows" INTEGER NOT NULL DEFAULT 2,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "furniture_pkey" PRIMARY KEY ("id")
);

-- StorageLocation: link a location to a furniture cell.
ALTER TABLE "storage_locations" ADD COLUMN     "furnitureId" TEXT,
ADD COLUMN     "cellX" INTEGER,
ADD COLUMN     "cellY" INTEGER;

-- CreateIndex
CREATE INDEX "storage_locations_furnitureId_idx" ON "storage_locations"("furnitureId");

-- AddForeignKey
ALTER TABLE "storage_locations" ADD CONSTRAINT "storage_locations_furnitureId_fkey" FOREIGN KEY ("furnitureId") REFERENCES "furniture"("id") ON DELETE SET NULL ON UPDATE CASCADE;
