-- 3D storage: elevation (stack/wall) + wall mounting for furniture.
ALTER TABLE "furniture" ADD COLUMN     "posY" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "mount" TEXT NOT NULL DEFAULT 'FLOOR';
