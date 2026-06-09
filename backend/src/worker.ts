import { Worker } from 'bullmq';
import { bullConnection } from './lib/redis';
import { EnrichJobData, ImportJobData, QUEUE_ENRICH, QUEUE_IMPORT } from './lib/queue';
import { ensureStorageDirs } from './lib/storage';
import { seedRoles } from './lib/seed';
import { processImport } from './worker/jobs/import';
import { processEnrich } from './worker/jobs/enrich';
import { discogs } from './worker/clients/discogs';

async function main() {
  await ensureStorageDirs();
  await seedRoles();

  const importWorker = new Worker<ImportJobData, void, string>(
    QUEUE_IMPORT,
    async (job) => {
      await processImport(job.data.importJobId);
    },
    { connection: bullConnection, concurrency: 1 },
  );

  // Stay under the Discogs rate limit: 60/min authenticated, 25/min anonymous.
  const max = discogs.hasToken() ? 55 : 22;
  const enrichWorker = new Worker<EnrichJobData, void, string>(
    QUEUE_ENRICH,
    async (job) => {
      await processEnrich(job.data.releaseId);
    },
    { connection: bullConnection, concurrency: 4, limiter: { max, duration: 60_000 } },
  );

  const workers: [string, Worker][] = [
    ['import', importWorker],
    ['enrich', enrichWorker],
  ];
  for (const [name, w] of workers) {
    w.on('failed', (job, err) =>
      console.error(`[worker:${name}] job ${job?.id} failed:`, err?.message),
    );
    w.on('error', (err) => console.error(`[worker:${name}] error:`, err?.message));
  }

  console.log(
    `Vinylarium worker started (Discogs token: ${discogs.hasToken() ? 'yes' : 'no'}, enrich limit: ${max}/min)`,
  );

  const shutdown = async () => {
    await Promise.all([importWorker.close(), enrichWorker.close()]);
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Worker fatal error:', err);
  process.exit(1);
});
