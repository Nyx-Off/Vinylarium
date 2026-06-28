-- 3D storage: lock a piece (no accidental move) + per-disc order within a cell.
ALTER TABLE "furniture" ADD COLUMN     "locked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "releases" ADD COLUMN     "storagePosition" INTEGER;

-- Seed contiguous positions (1..N) for discs already filed in furniture cells.
WITH ordered AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY "storageLocationId"
           ORDER BY "storagePosition" NULLS LAST, "artistDisplay", "year"
         ) AS rn
  FROM "releases"
  WHERE "storageLocationId" IN (SELECT id FROM "storage_locations" WHERE "furnitureId" IS NOT NULL)
)
UPDATE "releases" r SET "storagePosition" = o.rn FROM ordered o WHERE r.id = o.id;
