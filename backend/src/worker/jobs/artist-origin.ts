import { prisma } from '../../db/prisma';
import { musicbrainz, MbArtist } from '../clients/musicbrainz';
import { CountryGeo, geoForCountry, geoForISO } from '../../lib/countries';
import { upsertCountryByGeo } from '../../lib/upserts';

/** Placeholder names that can never resolve to a real origin. */
const NON_ARTISTS = new Set(['various', 'various artists', 'unknown artist', 'unknown', 'no artist', 'traditional']);

/** Discogs disambiguates homonyms with a numeric suffix: "Nirvana (2)". */
function cleanName(name: string): string {
  return name.replace(/\s*\(\d+\)\s*$/, '').trim();
}

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Best-effort match: an exact (accent/case-insensitive) name wins — candidates
 * are score-ordered so the most relevant homonym comes first. Otherwise only
 * accept a near-perfect search score.
 */
function pickMatch(name: string, candidates: MbArtist[]): MbArtist | null {
  const target = normalize(name);
  const exact = candidates.find((c) => normalize(c.name) === target);
  if (exact) return exact;
  const top = candidates[0];
  return top && top.score >= 95 ? top : null;
}

/** Country of the artist: ISO field first, then area names as fallback. */
function resolveGeo(m: MbArtist): CountryGeo | null {
  if (m.country) {
    const geo = geoForISO(m.country);
    if (geo) return geo;
  }
  for (const area of [m.areaName, m.beginAreaName]) {
    if (!area) continue;
    const geo = geoForCountry(area);
    if (geo) return geo;
  }
  return null;
}

/**
 * Resolve where an artist comes from via MusicBrainz (NOT the pressing
 * country of the vinyl). Throws on transient errors so BullMQ retries; the
 * worker marks FAILED once attempts are exhausted.
 */
export async function processArtistOrigin(artistId: string): Promise<void> {
  const artist = await prisma.artist.findUnique({ where: { id: artistId } });
  if (!artist || artist.originStatus === 'FOUND') return;

  const name = cleanName(artist.name);
  if (!name || NON_ARTISTS.has(normalize(name))) {
    await prisma.artist.update({
      where: { id: artistId },
      data: { originStatus: 'NOT_FOUND', originCheckedAt: new Date() },
    });
    return;
  }

  const candidates = await musicbrainz.searchArtists(name);
  const match = pickMatch(name, candidates);
  if (!match) {
    await prisma.artist.update({
      where: { id: artistId },
      data: { originStatus: 'NOT_FOUND', originCheckedAt: new Date() },
    });
    return;
  }

  const geo = resolveGeo(match);
  const country = geo ? await upsertCountryByGeo(geo) : null;
  await prisma.artist.update({
    where: { id: artistId },
    data: {
      mbid: match.mbid || null,
      originCountryId: country?.id ?? null,
      originStatus: country ? 'FOUND' : 'NOT_FOUND',
      originCheckedAt: new Date(),
    },
  });
}
