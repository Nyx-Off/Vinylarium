/** Text + classification helpers shared by the API and the worker. */

/**
 * Discogs placeholder "artists" that name no real artist. Searching Genius with
 * one matches a literal "Unknown Artist"/"Various" page and returns junk lyrics,
 * so these must never be used as a search artist — no lyrics beats wrong lyrics.
 */
export function isPlaceholderArtist(name?: string | null): boolean {
  if (!name) return true;
  const n = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return (
    n === '' ||
    n === 'va' ||
    n === 'various' ||
    n === 'various artists' ||
    n === 'unknown artist' ||
    n === 'unknown' ||
    n === 'no artist'
  );
}

/** Normalised key for ordering ("The Beatles" -> "beatles"). */
export function sortName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/^(the|le|la|les|los|las|el|a|an)\s+/i, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim();
}

export function deriveDecade(year?: number | null): number | null {
  if (!year || year < 1000) return null;
  return Math.floor(year / 10) * 10;
}

/** Parse a Discogs "released" string ("1987", "1987-07-00") into a year int. */
export function parseYear(released?: string | null): number | null {
  if (!released) return null;
  const m = released.match(/(\d{4})/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  return y >= 1000 && y <= 2200 ? y : null;
}

export interface VersionFlags {
  isStudio: boolean;
  isLive: boolean;
  isCompilation: boolean;
  isReissue: boolean;
  isRemaster: boolean;
  isSpecialEdition: boolean;
}

/**
 * Derive version flags from Discogs format descriptions + styles.
 * "Studio" is the absence of "Live" (Discogs has no positive studio flag).
 */
export function deriveVersionFlags(descriptions: string[], styles: string[] = []): VersionFlags {
  const hay = [...descriptions, ...styles].map((d) => d.toLowerCase());
  const has = (needle: string) => hay.some((d) => d.includes(needle));

  const isLive = has('live');
  return {
    isLive,
    isStudio: !isLive,
    isCompilation: has('compilation'),
    isReissue: has('reissue') || has('repress'),
    isRemaster: has('remaster'),
    isSpecialEdition:
      has('limited edition') || has('deluxe') || has('special edition') || has('box set'),
  };
}

/** Best-effort parse of a Discogs duration ("3:45") into seconds. */
export function durationToSeconds(duration?: string | null): number | null {
  if (!duration) return null;
  const parts = duration.split(':').map((p) => parseInt(p, 10));
  if (parts.some((p) => Number.isNaN(p))) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}
