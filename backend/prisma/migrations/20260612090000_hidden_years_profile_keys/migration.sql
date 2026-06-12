-- Release: hide-from-library flag, pressing year split, Genius pass date
ALTER TABLE "releases" ADD COLUMN     "hidden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pressingYear" INTEGER,
ADD COLUMN     "lyricsFetchedAt" TIMESTAMP(3);

-- Until now `year` held the pressing year (Discogs release year); keep that
-- value as the pressing year. `year` will be rewritten to the ORIGINAL
-- (master) year by the next enrichment pass.
UPDATE "releases" SET "pressingYear" = "year" WHERE "year" IS NOT NULL;

-- Releases that already have lyrics or a Genius anecdote have had a
-- successful Genius pass — date it so "re-enrich missing only" skips them.
UPDATE "releases" r SET "lyricsFetchedAt" = COALESCE(r."enrichedAt", r."updatedAt")
WHERE EXISTS (SELECT 1 FROM "lyrics" l WHERE l."releaseId" = r.id AND l."source" = 'GENIUS')
   OR EXISTS (SELECT 1 FROM "anecdotes" a WHERE a."releaseId" = r.id AND a."source" = 'GENIUS');

-- CreateIndex
CREATE INDEX "releases_hidden_idx" ON "releases"("hidden");

-- User: per-user Discogs credentials (collection sync via the API)
ALTER TABLE "users" ADD COLUMN     "discogsUsername" TEXT,
ADD COLUMN     "discogsToken" TEXT;
