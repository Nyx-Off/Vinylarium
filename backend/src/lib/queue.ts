import { Queue } from 'bullmq';
import { bullConnection } from './redis';

export const QUEUE_IMPORT = 'import';
export const QUEUE_ENRICH = 'enrich';
export const QUEUE_LYRICS = 'lyrics';
// One queue for EVERY MusicBrainz call (origin searches + relations lookups)
// so a single 1 req/s limiter covers them all. Job name picks the handler:
// 'origin' | 'relations'.
export const QUEUE_MUSICBRAINZ = 'musicbrainz';

export interface ImportJobData {
  importJobId: string;
}

export interface EnrichJobData {
  releaseId: string;
}

export interface LyricsJobData {
  releaseId: string;
}

export interface MusicBrainzJobData {
  artistId: string;
}

/**
 * Stable jobIds so the same artist is never queued twice at once for the same
 * lookup (compilations enqueue the same artists over and over while the first
 * one is pending).
 */
export const artistOriginJobId = (artistId: string) => `origin-${artistId}`;
export const artistRelationsJobId = (artistId: string) => `rel-${artistId}`;

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
// Genius rate-limits sustained traffic with long 429 windows (an hour or
// more), so retries must stretch far: 5 → 10 → 20 → … minutes, ~10h overall.
export const lyricsQueue = new Queue<LyricsJobData, void, string>(QUEUE_LYRICS, {
  connection: bullConnection,
  defaultJobOptions: {
    attempts: 8,
    backoff: { type: 'exponential', delay: 300_000 },
    removeOnComplete: 500,
    removeOnFail: 1000,
  },
});

// MusicBrainz lookups: hard-capped at ~1 req/s by the worker, so this queue
// drains slowly — never put anything blocking on it.
export const musicbrainzQueue = new Queue<MusicBrainzJobData, void, string>(
  QUEUE_MUSICBRAINZ,
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
