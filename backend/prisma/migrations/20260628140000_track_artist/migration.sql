-- Per-track artist: compilations/soundtracks bill the release as "Various" while
-- each track has its own artist. Storing it lets the lyrics lookup search Genius
-- with the REAL artist instead of "Various" (which matched nothing). Null = use
-- the release-level artist, as before.
ALTER TABLE "tracks" ADD COLUMN     "artistDisplay" TEXT;
