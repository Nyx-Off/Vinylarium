import { prisma } from '../../db/prisma';
import { enrichQueue } from '../../lib/queue';
import { deriveDecade, sortName } from '../../lib/text';
import { discogs } from '../clients/discogs';

const PAGE_GAP_MS = 1100; // pace collection pages like every other Discogs call

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** "Pink Floyd" / "Crosby, Stills & Nash" from the basic_information artists. */
function displayArtist(artists: any[]): string {
  if (!Array.isArray(artists) || artists.length === 0) return 'Unknown Artist';
  let out = '';
  for (const a of artists) {
    out += (a?.anv || a?.name || '').trim();
    if (a?.join && a.join !== ',') out += ` ${a.join} `;
    else if (a?.join === ',') out += ', ';
  }
  return out.trim() || 'Unknown Artist';
}

/**
 * Pull a user's whole Discogs collection through the API (no CSV export):
 * pages of /users/{username}/collection, dedup against the library by
 * discogsReleaseId, create the missing releases and queue their enrichment.
 * Progress is reported through the same ImportJob row the CSV import uses,
 * so the UI polls both kinds of import identically.
 */
export async function processDiscogsSync(importJobId: string): Promise<void> {
  const job = await prisma.importJob.findUnique({ where: { id: importJobId } });
  if (!job) return;

  const user = job.userId
    ? await prisma.user.findUnique({ where: { id: job.userId } })
    : null;
  if (!user?.discogsUsername) {
    await prisma.importJob.update({
      where: { id: importJobId },
      data: { status: 'FAILED', error: 'Aucun identifiant Discogs dans le profil' },
    });
    return;
  }

  await prisma.importJob.update({
    where: { id: importJobId },
    data: { status: 'PARSING', startedAt: new Date() },
  });

  let processed = 0;
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  const enrichIds: string[] = [];
  const seen = new Set<number>();

  try {
    let page = 1;
    let pages = 1;
    do {
      const res = await discogs.getCollectionPage(user.discogsUsername, page, user.discogsToken);
      pages = res.pages;
      if (page === 1) {
        await prisma.importJob.update({
          where: { id: importJobId },
          data: { status: 'ENRICHING', totalRows: res.items },
        });
      }

      for (const item of res.releases) {
        processed++;
        try {
          const bi = item?.basic_information;
          const discogsId: number | undefined = bi?.id;
          if (!discogsId || !Number.isFinite(discogsId)) {
            failed++;
            continue;
          }
          if (seen.has(discogsId)) {
            skipped++;
            continue;
          }
          seen.add(discogsId);

          const existing = await prisma.release.findUnique({
            where: { discogsReleaseId: discogsId },
            select: { id: true },
          });
          if (existing) {
            skipped++;
            continue;
          }

          const title: string = bi?.title || 'Untitled';
          const year: number | null =
            typeof bi?.year === 'number' && bi.year > 0 ? bi.year : null;
          const created = await prisma.release.create({
            data: {
              source: 'DISCOGS',
              enrichmentStatus: 'QUEUED',
              discogsReleaseId: discogsId,
              title,
              sortTitle: sortName(title),
              artistDisplay: displayArtist(bi?.artists),
              // Pressing year for now — enrichment swaps in the original
              // (master) year and fills pressingYear properly.
              year: year ?? undefined,
              decade: deriveDecade(year),
              catalogNumber: bi?.labels?.[0]?.catno || undefined,
              rating: typeof item?.rating === 'number' && item.rating > 0 ? item.rating : undefined,
              thumbUrl: bi?.thumb || undefined,
              dateAdded: item?.date_added ? new Date(item.date_added) : new Date(),
              addedByUserId: user.id,
            },
          });
          imported++;
          enrichIds.push(created.id);
        } catch {
          failed++;
        }
      }

      await prisma.importJob.update({
        where: { id: importJobId },
        data: {
          processedRows: processed,
          importedCount: imported,
          skippedCount: skipped,
          failedCount: failed,
        },
      });

      page++;
      if (page <= pages) await sleep(PAGE_GAP_MS);
    } while (page <= pages);
  } catch (e) {
    await prisma.importJob.update({
      where: { id: importJobId },
      data: {
        status: 'FAILED',
        error: (e as Error).message,
        processedRows: processed,
        importedCount: imported,
        skippedCount: skipped,
        failedCount: failed,
        finishedAt: new Date(),
      },
    });
    // Still enrich what made it in before the failure.
    for (const id of enrichIds) await enrichQueue.add('enrich', { releaseId: id });
    return;
  }

  for (const id of enrichIds) await enrichQueue.add('enrich', { releaseId: id });

  await prisma.importJob.update({
    where: { id: importJobId },
    data: {
      status: 'COMPLETED',
      processedRows: processed,
      importedCount: imported,
      skippedCount: skipped,
      failedCount: failed,
      finishedAt: new Date(),
    },
  });
}
