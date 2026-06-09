import { Queue } from 'bullmq';
import { bullConnection } from './redis';

export const QUEUE_IMPORT = 'import';
export const QUEUE_ENRICH = 'enrich';
export const QUEUE_LYRICS = 'lyrics';

export interface ImportJobData {
  importJobId: string;
}

export interface EnrichJobData {
  releaseId: string;
}

export interface LyricsJobData {
  releaseId: string;
}

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
