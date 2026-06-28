-- Complementary lyrics source: LRCLIB (lrclib.net), used as a fallback when
-- Genius has no page for a track.
ALTER TYPE "TextSource" ADD VALUE IF NOT EXISTS 'LRCLIB';
