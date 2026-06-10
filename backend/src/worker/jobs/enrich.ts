import { prisma } from '../../db/prisma';
import { discogs, DiscogsError } from '../clients/discogs';
import { genius } from '../clients/genius';
import { artistOriginJobId, artistOriginQueue, lyricsQueue } from '../../lib/queue';
import { applyDiscogsRelease } from '../lib/map-discogs';

/** Enrich a single release from the Discogs API. Throws to let BullMQ retry. */
export async function processEnrich(releaseId: string): Promise<void> {
  const release = await prisma.release.findUnique({ where: { id: releaseId } });
  if (!release || !release.discogsReleaseId) return;

  await prisma.release.update({ where: { id: releaseId }, data: { enrichmentStatus: 'ENRICHING' } });

  let data: any;
  try {
    data = await discogs.getRelease(release.discogsReleaseId);
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
    await applyDiscogsRelease(releaseId, data);
    await prisma.release.update({
      where: { id: releaseId },
      data: { enrichmentStatus: 'ENRICHED', enrichmentError: null, enrichedAt: new Date() },
    });
    // Lyrics run on their own queue so scraping never blocks enrichment.
    if (genius.hasAuth()) {
      await lyricsQueue.add('lyrics', { releaseId }).catch(() => undefined);
    }
    // Artist origins (MusicBrainz) — only billed artists not yet resolved.
    const pendingArtists = await prisma.artist.findMany({
      where: { originStatus: 'PENDING', releases: { some: { releaseId } } },
      select: { id: true },
    });
    if (pendingArtists.length > 0) {
      await artistOriginQueue
        .addBulk(
          pendingArtists.map((a) => ({
            name: 'artist-origin',
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
