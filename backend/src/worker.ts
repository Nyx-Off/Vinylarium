import { Worker } from 'bullmq';
import { bullConnection } from './lib/redis';
import { enrichQueue } from './lib/queue';
import {
  EnrichJobData,
  ImportJobData,
  LyricsJobData,
  QUEUE_ENRICH,
  QUEUE_IMPORT,
  QUEUE_LYRICS,
} from './lib/queue';
import { ensureStorageDirs } from './lib/storage';
import { seedRoles } from './lib/seed';
import { prisma } from './db/prisma';
import { processImport } from './worker/jobs/import';
import { processEnrich } from './worker/jobs/enrich';
import { processLyrics } from './worker/jobs/lyrics';
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

async function main() {
  await ensureStorageDirs();
  await seedRoles();
  await recoverStuckEnrichments();

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

  const workers: [string, Worker][] = [
    ['import', importWorker],
    ['enrich', enrichWorker],
    ['lyrics', lyricsWorker],
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

  console.log(
    `Vinylarium worker started (Discogs auth: ${discogs.hasAuth() ? 'yes' : 'no'}, ` +
      `enrich limit: ${max}/min, Genius lyrics: ${genius.hasAuth() ? 'yes' : 'no'})`,
  );

  const shutdown = async () => {
    await Promise.all([importWorker.close(), enrichWorker.close(), lyricsWorker.close()]);
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Worker fatal error:', err);
  process.exit(1);
});
