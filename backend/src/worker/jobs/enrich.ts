import { prisma } from '../../db/prisma';
import { discogs, DiscogsError } from '../clients/discogs';
import { genius } from '../clients/genius';
import { artistOriginJobId, lyricsQueue, musicbrainzQueue } from '../../lib/queue';
import { applyDiscogsRelease } from '../lib/map-discogs';

// Master → original-year cache: many pressings share a master, and a re-run
// of the whole collection would otherwise refetch each master every time.
const masterYearCache = new Map<number, number | null>();

/**
 * Original release year of the music (master year). Best-effort: a missing
 * master or an API error keeps the pressing year; a 429 rethrows so the job
 * retries with the rest of the enrichment.
 */
async function masterYearOf(masterId: unknown): Promise<number | null> {
  if (typeof masterId !== 'number' || masterId <= 0) return null;
  if (masterYearCache.has(masterId)) return masterYearCache.get(masterId)!;
  try {
    const year = await discogs.getMasterYear(masterId);
    masterYearCache.set(masterId, year);
    return year;
  } catch (e) {
    if (e instanceof DiscogsError && e.rateLimited) throw e;
    return null;
  }
}

/** Enrich a single release from the Discogs API. Throws to let BullMQ retry. */
export async function processEnrich(releaseId: string): Promise<void> {
  const release = await prisma.release.findUnique({ where: { id: releaseId } });
  if (!release || !release.discogsReleaseId) return;

  await prisma.release.update({ where: { id: releaseId }, data: { enrichmentStatus: 'ENRICHING' } });

  let data: any;
  let masterYear: number | null = null;
  try {
    data = await discogs.getRelease(release.discogsReleaseId);
    masterYear = await masterYearOf(data?.master_id);
  } catch (e) {
    if (e instanceof DiscogsError && e.notFound) {
      await prisma.release.update({
        where: { id: releaseId },
        data: { enrichmentStatus: 'FAILED', enrichmentError: 'Not found on Discogs' },
      });
      return; // not retryable
    }
    // Transient (429 / 5xx): requeue state and rethrow so BullMQ retries.
    await prisma.release.update({
      where: { id: releaseId },
      data: { enrichmentStatus: 'QUEUED', enrichmentError: (e as Error).message },
    });
    throw e;
  }

  try {
    await applyDiscogsRelease(releaseId, data, masterYear);
    await prisma.release.update({
      where: { id: releaseId },
      data: { enrichmentStatus: 'ENRICHED', enrichmentError: null, enrichedAt: new Date() },
    });
    // Lyrics run on their own queue so scraping never blocks enrichment —
    // but only for releases never visited (lyricsFetchedAt null): a bulk
    // Discogs re-enrich must not re-burn a day of Genius quota. Forcing a
    // refresh goes through "Récupérer les paroles" on the release sheet.
    if (genius.hasAuth() && !release.lyricsFetchedAt) {
      await lyricsQueue.add('lyrics', { releaseId }).catch(() => undefined);
    }
    // Artist origins (MusicBrainz) — only billed artists not yet resolved.
    const pendingArtists = await prisma.artist.findMany({
      where: { originStatus: 'PENDING', releases: { some: { releaseId } } },
      select: { id: true },
    });
    if (pendingArtists.length > 0) {
      await musicbrainzQueue
        .addBulk(
          pendingArtists.map((a) => ({
            name: 'origin',
            data: { artistId: a.id },
            opts: { jobId: artistOriginJobId(a.id) },
          })),
        )
        .catch(() => undefined);
    }
  } catch (e) {
    await prisma.release.update({
      where: { id: releaseId },
      data: { enrichmentStatus: 'FAILED', enrichmentError: (e as Error).message },
    });
    throw e;
  }
}
