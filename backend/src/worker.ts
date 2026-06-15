import { Worker } from 'bullmq';
import { bullConnection } from './lib/redis';
import { enrichQueue, musicbrainzQueue } from './lib/queue';
import {
  EnrichJobData,
  ImportJobData,
  LyricsJobData,
  MusicBrainzJobData,
  QUEUE_ENRICH,
  QUEUE_IMPORT,
  QUEUE_LYRICS,
  QUEUE_MUSICBRAINZ,
  artistOriginJobId,
  artistRelationsJobId,
} from './lib/queue';
import { ensureStorageDirs } from './lib/storage';
import { applyApiKeyOverrides } from './lib/api-keys';
import { seedRoles } from './lib/seed';
import { prisma } from './db/prisma';
import { processImport } from './worker/jobs/import';
import { processDiscogsSync } from './worker/jobs/discogs-sync';
import { processEnrich, processFixYears } from './worker/jobs/enrich';
import { processLyrics } from './worker/jobs/lyrics';
import { processAlbumAnecdote } from './worker/jobs/anecdote';
import { processArtistOrigin } from './worker/jobs/artist-origin';
import { processArtistRelations } from './worker/jobs/artist-relations';
import { discogs } from './worker/clients/discogs';
import { genius, GeniusRateLimitError } from './worker/clients/genius';

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
 * Queue MusicBrainz lookups for billed artists: origin searches never tried
 * (PENDING) or failed transiently (FAILED), plus relations lookups for
 * artists whose mbid is known. Stable jobIds dedupe against jobs already
 * sitting in Redis from a previous run, so booting is idempotent.
 */
async function backfillMusicBrainz() {
  // Failed jobs keep their jobId reserved — purge them so FAILED can requeue.
  await musicbrainzQueue.clean(0, 100_000, 'failed').catch(() => undefined);

  const origins = await prisma.artist.findMany({
    where: { originStatus: { in: ['PENDING', 'FAILED'] }, releases: { some: {} } },
    select: { id: true },
  });
  const relations = await prisma.artist.findMany({
    where: { relationsStatus: { in: ['PENDING', 'FAILED'] }, mbid: { not: null } },
    select: { id: true },
  });

  const jobs = [
    ...origins.map((a) => ({
      name: 'origin',
      data: { artistId: a.id },
      opts: { jobId: artistOriginJobId(a.id) },
    })),
    ...relations.map((a) => ({
      name: 'relations',
      data: { artistId: a.id },
      opts: { jobId: artistRelationsJobId(a.id) },
    })),
  ];
  if (jobs.length === 0) return;
  await musicbrainzQueue.addBulk(jobs);
  console.log(
    `Queued ${origins.length} MusicBrainz origin lookup(s) and ${relations.length} relations lookup(s).`,
  );
}

async function main() {
  await ensureStorageDirs();
  await seedRoles();
  // UI-saved API keys override .env; re-read every minute so a key saved in
  // the Settings page reaches the worker without a restart.
  await applyApiKeyOverrides();
  setInterval(() => applyApiKeyOverrides().catch(() => undefined), 60_000);
  await recoverStuckEnrichments();
  await backfillMusicBrainz();

  // Job name picks the source: 'discogs-sync' pulls the user's collection
  // through the Discogs API (profile credentials), anything else parses a CSV.
  const importWorker = new Worker<ImportJobData, void, string>(
    QUEUE_IMPORT,
    async (job) => {
      if (job.name === 'discogs-sync') await processDiscogsSync(job.data.importJobId);
      else await processImport(job.data.importJobId);
    },
    { connection: bullConnection, concurrency: 1 },
  );

  // Stay under the Discogs rate limit: 60/min authenticated, 25/min anonymous.
  // Each enrich job can make up to TWO API calls (release + master for the
  // original year), so the per-JOB limiter budgets half the request quota.
  const max = discogs.hasAuth() ? 27 : 11;
  const enrichWorker = new Worker<EnrichJobData, void, string>(
    QUEUE_ENRICH,
    async (job) => {
      // 'fix-years' = light master-only pass (recompute original/pressing year
      // on discs enriched before the split); anything else = full enrichment.
      if (job.name === 'fix-years') await processFixYears(job.data.releaseId);
      else await processEnrich(job.data.releaseId);
    },
    { connection: bullConnection, concurrency: 4, limiter: { max, duration: 60_000 } },
  );

  // 'lyrics' = full pass (album anecdote + per-track lyrics);
  // 'anecdote' = Genius album description only (cheap backfills).
  // Genius has a ~10k requests/day quota; when it 429s, pause the WHOLE queue
  // and put the job back untouched (Worker.RateLimitError does not consume a
  // retry attempt) — every 15 min one cheap probe rediscovers whether the
  // quota window has reset.
  const lyricsWorker: Worker<LyricsJobData, void, string> = new Worker<LyricsJobData, void, string>(
    QUEUE_LYRICS,
    async (job) => {
      try {
        if (job.name === 'anecdote') await processAlbumAnecdote(job.data.releaseId);
        else await processLyrics(job.data.releaseId);
      } catch (e) {
        if (e instanceof GeniusRateLimitError) {
          console.warn(`[lyrics] Genius 429 — queue paused 15 min (job ${job.id})`);
          await lyricsWorker.rateLimit(15 * 60_000);
          throw Worker.RateLimitError();
        }
        throw e;
      }
    },
    { connection: bullConnection, concurrency: 1, limiter: { max: 30, duration: 60_000 } },
  );

  // MusicBrainz allows 1 request/second — every MB call (origin search or
  // relations lookup) goes through this single limited worker.
  const musicbrainzWorker = new Worker<MusicBrainzJobData, void, string>(
    QUEUE_MUSICBRAINZ,
    async (job) => {
      if (job.name === 'relations') await processArtistRelations(job.data.artistId);
      else await processArtistOrigin(job.data.artistId);
    },
    { connection: bullConnection, concurrency: 1, limiter: { max: 1, duration: 1100 } },
  );

  const workers: [string, Worker][] = [
    ['import', importWorker],
    ['enrich', enrichWorker],
    ['lyrics', lyricsWorker],
    ['musicbrainz', musicbrainzWorker],
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

  // Same pattern as enrich: when MusicBrainz attempts are exhausted, mark the
  // artist FAILED (it will be retried on the next worker boot).
  musicbrainzWorker.on('failed', async (job) => {
    if (!job) return;
    const attempts = job.opts.attempts ?? 1;
    if (job.attemptsMade >= attempts) {
      const data =
        job.name === 'relations'
          ? { relationsStatus: 'FAILED' as const, relationsCheckedAt: new Date() }
          : { originStatus: 'FAILED' as const, originCheckedAt: new Date() };
      await prisma.artist
        .update({ where: { id: job.data.artistId }, data })
        .catch(() => undefined);
    }
  });

  console.log(
    `Vinylarium worker started (Discogs auth: ${discogs.hasAuth() ? 'yes' : 'no'}, ` +
      `enrich limit: ${max}/min, Genius lyrics: ${genius.hasAuth() ? 'yes' : 'no'}, ` +
      `MusicBrainz: 1 req/s)`,
  );

  const shutdown = async () => {
    await Promise.all([
      importWorker.close(),
      enrichWorker.close(),
      lyricsWorker.close(),
      musicbrainzWorker.close(),
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
