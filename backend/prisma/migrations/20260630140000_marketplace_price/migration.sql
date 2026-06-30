-- Discogs marketplace snapshot, captured during enrichment (same API response,
-- no extra call). Powers the "valeur de la collection" stats.
ALTER TABLE "releases"
  ADD COLUMN "lowestPrice"    DOUBLE PRECISION,
  ADD COLUMN "priceCurrency"  TEXT,
  ADD COLUMN "numForSale"     INTEGER,
  ADD COLUMN "communityHave"  INTEGER,
  ADD COLUMN "communityWant"  INTEGER,
  ADD COLUMN "priceCheckedAt" TIMESTAMP(3);
