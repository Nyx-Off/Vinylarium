-- Full-text search over lyrics. GIN index on a 'simple' tsvector (no stemming,
-- so it works across the many languages lyrics come in). Powers GET /search/lyrics.
CREATE INDEX IF NOT EXISTS "lyrics_text_fts" ON "lyrics" USING GIN (to_tsvector('simple', "text"));
