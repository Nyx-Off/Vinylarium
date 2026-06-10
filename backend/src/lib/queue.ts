import { Queue } from 'bullmq';
import { bullConnection } from './redis';

export const QUEUE_IMPORT = 'import';
export const QUEUE_ENRICH = 'enrich';
export const QUEUE_LYRICS = 'lyrics';
export const QUEUE_ARTIST_ORIGIN = 'artist-origin';

export interface ImportJobData {
  importJobId: string;
}

export interface EnrichJobData {
  releaseId: string;
}

export interface LyricsJobData {
  releaseId: string;
}

export interface ArtistOriginJobData {
  artistId: string;
}

/**
 * Stable jobId so the same artist is never queued twice at once (compilations
 * enqueue the same artists over and over while the first lookup is pending).
 */
export const artistOriginJobId = (artistId: string) => `origin-${artistId}`;

/** Producers used by the API to enqueue background work. */
export const importQueue = new Queue<ImportJobData, void, string>(QUEUE_IMPORT, {
  connection: bullConnection,
});
export const enrichQueue = new Queue<EnrichJobData, void, string>(QUEUE_ENRICH, {
  connection: bullConnection,
  defaultJobOptions: {
    attempts: 4,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});

// Lyrics scraping is best-effort and slow; keep it off the enrichment path.
export const lyricsQueue = new Queue<LyricsJobData, void, string>(QUEUE_LYRICS, {
  connection: bullConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 10_000 },
    removeOnComplete: 500,
    removeOnFail: 1000,
  },
});

// MusicBrainz artist-origin lookups: hard-capped at ~1 req/s by the worker,
// so this queue drains slowly — never put anything blocking on it.
export const artistOriginQueue = new Queue<ArtistOriginJobData, void, string>(
  QUEUE_ARTIST_ORIGIN,
  {
    connection: bullConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 15_000 },
      removeOnComplete: 5000,
      removeOnFail: 5000,
    },
  },
);
