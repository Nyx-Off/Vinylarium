import IORedis from 'ioredis';
import type { ConnectionOptions } from 'bullmq';
import { config } from '../config';

/**
 * Shared Redis connection. BullMQ requires `maxRetriesPerRequest: null` on the
 * connection it uses for blocking commands.
 */
export const connection = new IORedis(config.redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

connection.on('error', (err) => {
  // Avoid crashing on transient Redis hiccups; BullMQ reconnects.
  console.error('[redis] connection error:', err.message);
});

// BullMQ bundles its own copy of ioredis; the two ioredis types are nominally
// distinct even though they are runtime-compatible. Cast once here so queue and
// worker code stays clean.
export const bullConnection = connection as unknown as ConnectionOptions;
