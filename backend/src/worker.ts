import { Worker } from 'bullmq';
import { bullConnection } from './lib/redis';
import { artistOriginQueue, enrichQueue } from './lib/queue';
import {
  ArtistOriginJobData,
  EnrichJobData,
  ImportJobData,
  LyricsJobData,
  QUEUE_ARTIST_ORIGIN,
  QUEUE_ENRICH,
  QUEUE_IMPORT,
  QUEUE_LYRICS,
  artistOriginJobId,
} from './lib/queue';
import { ensureStorageDirs } from './lib/storage';
import { seedRoles } from './lib/seed';
import { prisma } from './db/prisma';
import { processImport } from './worker/jobs/import';
import { processEnrich } from './worker/jobs/enrich';
import { processLyrics } from './worker/jobs/lyrics';
import { processArtistOrigin } from './worker/jobs/artist-origin';
import { discogs } from './worker/clients/discogs';
import { genius } from './worker/clients/genius';

/**
 * If the worker crashed (or was killed) mid-enrichment, releases are left
 * stuck on ENRICHING forever — the job is gone from the queue but the DB still
 * says "in progress". On boot, requeue anything that was interrupted.
 */
async function recoverStuckEnrichments() {
  const stuck = await prisma.release.findMany({
    where: { enrichmentStatus: 'ENRICHING' },
    select: { id: true },
  });
  if (stuck.length === 0) return;
  await prisma.release.updateMany({
    where: { enrichmentStatus: 'ENRICHING' },
    data: { enrichmentStatus: 'QUEUED' },
  });
  await enrichQueue.addBulk(
    stuck.map((r) => ({ name: 'enrich', data: { releaseId: r.id } })),
  );
  console.log(`Requeued ${stuck.length} interrupted enrichment(s).`);
}

/**
 * Queue MusicBrainz origin lookups for billed artists never tried (PENDING)
 * or that failed transiently (FAILED). The stable jobId dedupes against jobs
 * already sitting in Redis from a previous run, so booting is idempotent.
 */
async function backfillArtistOrigins() {
  // Failed jobs keep their jobId reserved — purge them so FAILED can requeue.
  await artistOriginQueue.clean(0, 100_000, 'failed').catch(() => undefined);
  const artists = await prisma.artist.findMany({
    where: { originStatus: { in: ['PENDING', 'FAILED'] }, releases: { some: {} } },
    select: { id: true },
  });
  if (artists.length === 0) return;
  await artistOriginQueue.addBulk(
    artists.map((a) => ({
      name: 'artist-origin',
      data: { artistId: a.id },
      opts: { jobId: artistOriginJobId(a.id) },
    })),
  );
  console.log(`Queued ${artists.length} MusicBrainz origin lookup(s).`);
}

async function main() {
  await ensureStorageDirs();
  await seedRoles();
  await recoverStuckEnrichments();
  await backfillArtistOrigins();

  const importWorker = new Worker<ImportJobData, void, string>(
    QUEUE_IMPORT,
    async (job) => {
      await processImport(job.data.importJobId);
    },
    { connection: bullConnection, concurrency: 1 },
  );

  // Stay under the Discogs rate limit: 60/min authenticated, 25/min anonymous.
  const max = discogs.hasAuth() ? 55 : 22;
  const enrichWorker = new Worker<EnrichJobData, void, string>(
    QUEUE_ENRICH,
    async (job) => {
      await processEnrich(job.data.releaseId);
    },
    { connection: bullConnection, concurrency: 4, limiter: { max, duration: 60_000 } },
  );

  const lyricsWorker = new Worker<LyricsJobData, void, string>(
    QUEUE_LYRICS,
    async (job) => {
      await processLyrics(job.data.releaseId);
    },
    { connection: bullConnection, concurrency: 1 },
  );

  // MusicBrainz allows 1 request/second — stay just under it.
  const originWorker = new Worker<ArtistOriginJobData, void, string>(
    QUEUE_ARTIST_ORIGIN,
    async (job) => {
      await processArtistOrigin(job.data.artistId);
    },
    { connection: bullConnection, concurrency: 1, limiter: { max: 1, duration: 1100 } },
  );

  const workers: [string, Worker][] = [
    ['import', importWorker],
    ['enrich', enrichWorker],
    ['lyrics', lyricsWorker],
    ['artist-origin', originWorker],
  ];
  for (const [name, w] of workers) {
    w.on('failed', (job, err) =>
      console.error(`[worker:${name}] job ${job?.id} failed:`, err?.message),
    );
    w.on('error', (err) => console.error(`[worker:${name}] error:`, err?.message));
  }

  // When an enrich job exhausts all retries, leave the release as FAILED rather
  // than stuck on QUEUED, so the UI can surface it for a manual re-enrich.
  enrichWorker.on('failed', async (job, err) => {
    if (!job) return;
    const attempts = job.opts.attempts ?? 1;
    if (job.attemptsMade >= attempts) {
      await prisma.release
        .update({
          where: { id: job.data.releaseId },
          data: { enrichmentStatus: 'FAILED', enrichmentError: err?.message ?? 'Enrichment failed' },
        })
        .catch(() => undefined);
    }
  });

  // Same pattern as enrich: when origin attempts are exhausted, mark the
  // artist FAILED (it will be retried on the next worker boot).
  originWorker.on('failed', async (job) => {
    if (!job) return;
    const attempts = job.opts.attempts ?? 1;
    if (job.attemptsMade >= attempts) {
      await prisma.artist
        .update({
          where: { id: job.data.artistId },
          data: { originStatus: 'FAILED', originCheckedAt: new Date() },
        })
        .catch(() => undefined);
    }
  });

  console.log(
    `Vinylarium worker started (Discogs auth: ${discogs.hasAuth() ? 'yes' : 'no'}, ` +
      `enrich limit: ${max}/min, Genius lyrics: ${genius.hasAuth() ? 'yes' : 'no'}, ` +
      `MusicBrainz origins: 1 req/s)`,
  );

  const shutdown = async () => {
    await Promise.all([
      importWorker.close(),
      enrichWorker.close(),
      lyricsWorker.close(),
      originWorker.close(),
    ]);
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Worker fatal error:', err);
  process.exit(1);
});
