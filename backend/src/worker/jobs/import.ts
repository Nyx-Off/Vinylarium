import { promises as fs } from 'fs';
import { prisma } from '../../db/prisma';
import { absPath } from '../../lib/storage';
import { enrichQueue } from '../../lib/queue';
import { deriveDecade, parseYear, sortName } from '../../lib/text';
import { DiscogsCsvRow, parseDate, parseDiscogsCsv, parseRating } from '../lib/csv';

function field(row: DiscogsCsvRow, key: string): string {
  return (row[key] ?? '').trim();
}

async function createBasicRelease(row: DiscogsCsvRow, discogsId: number | null, userId?: string | null) {
  const title = field(row, 'Title') || 'Untitled';
  const artist = field(row, 'Artist') || 'Unknown Artist';
  const released = field(row, 'Released');
  const year = parseYear(released);

  return prisma.release.create({
    data: {
      source: 'DISCOGS',
      enrichmentStatus: discogsId ? 'QUEUED' : 'MANUAL',
      discogsReleaseId: discogsId ?? undefined,
      title,
      sortTitle: sortName(title),
      artistDisplay: artist,
      year: year ?? undefined,
      decade: deriveDecade(year),
      releasedRaw: released || undefined,
      catalogNumber: field(row, 'Catalog#') || undefined,
      rating: parseRating(field(row, 'Rating')),
      collectionFolder: field(row, 'CollectionFolder') || undefined,
      mediaCondition: field(row, 'Collection Media Condition') || undefined,
      sleeveCondition: field(row, 'Collection Sleeve Condition') || undefined,
      collectionNotes: field(row, 'Collection Notes') || undefined,
      dateAdded: parseDate(field(row, 'Date Added')),
      addedByUserId: userId ?? undefined,
    },
  });
}

/** Parse a Discogs collection CSV, create release rows, and queue enrichment. */
export async function processImport(importJobId: string): Promise<void> {
  const job = await prisma.importJob.findUnique({ where: { id: importJobId } });
  if (!job) return;
  if (!job.storedFilePath) {
    await prisma.importJob.update({ where: { id: importJobId }, data: { status: 'FAILED', error: 'No stored file' } });
    return;
  }

  await prisma.importJob.update({
    where: { id: importJobId },
    data: { status: 'PARSING', startedAt: new Date() },
  });

  let rows: DiscogsCsvRow[];
  try {
    const content = await fs.readFile(absPath(job.storedFilePath));
    rows = parseDiscogsCsv(content);
  } catch (e) {
    await prisma.importJob.update({
      where: { id: importJobId },
      data: { status: 'FAILED', error: `Parse error: ${(e as Error).message}` },
    });
    return;
  }

  await prisma.importJob.update({
    where: { id: importJobId },
    data: { status: 'ENRICHING', totalRows: rows.length },
  });

  let processed = 0;
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  const enrichIds: string[] = [];
  const seen = new Set<number>();

  for (const row of rows) {
    processed++;
    try {
      const discogsId = parseInt(field(row, 'release_id'), 10);
      const hasId = Number.isFinite(discogsId) && discogsId > 0;
      const title = field(row, 'Title');

      if (!hasId) {
        if (title) {
          await createBasicRelease(row, null, job.userId);
          imported++;
        } else {
          failed++;
        }
        continue;
      }

      if (seen.has(discogsId)) {
        skipped++;
        continue;
      }
      seen.add(discogsId);

      const existing = await prisma.release.findUnique({ where: { discogsReleaseId: discogsId } });
      if (existing) {
        skipped++;
        continue;
      }

      const created = await createBasicRelease(row, discogsId, job.userId);
      imported++;
      enrichIds.push(created.id);
    } catch {
      failed++;
    }

    if (processed % 20 === 0) {
      await prisma.importJob.update({
        where: { id: importJobId },
        data: { processedRows: processed, importedCount: imported, skippedCount: skipped, failedCount: failed },
      });
    }
  }

  // Queue enrichment for the newly imported releases.
  for (const id of enrichIds) {
    await enrichQueue.add('enrich', { releaseId: id });
  }

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
