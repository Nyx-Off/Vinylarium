-- Raw timestamped LRC (from LRCLIB) so the UI can highlight lyrics in sync with
-- Spotify playback. Plain `text` stays the source of truth for search/display.
ALTER TABLE "lyrics" ADD COLUMN "synced" TEXT;
