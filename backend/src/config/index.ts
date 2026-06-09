/**
 * Centralised, validated runtime configuration.
 * All environment access goes through this module so the rest of the codebase
 * never reads `process.env` directly.
 */

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

export const config = {
  env: optional('NODE_ENV', 'development'),
  isProd: optional('NODE_ENV', 'development') === 'production',

  port: parseInt(optional('PORT', '3000'), 10),
  host: optional('HOST', '0.0.0.0'),

  databaseUrl: required('DATABASE_URL'),
  redisUrl: optional('REDIS_URL', 'redis://redis:6379'),

  jwt: {
    secret: required('JWT_SECRET', 'dev-insecure-secret-change-me'),
    expiresIn: optional('JWT_EXPIRES_IN', '30d'),
  },

  storageDir: optional('STORAGE_DIR', '/data'),

  discogs: {
    token: optional('DISCOGS_TOKEN'),
    userAgent: optional('DISCOGS_USER_AGENT', 'Vinylarium/0.1 +https://github.com/Nyx-Off/Vinylarium'),
  },

  musicbrainz: {
    userAgent: optional('MUSICBRAINZ_USER_AGENT', 'Vinylarium/0.1 ( https://github.com/Nyx-Off/Vinylarium )'),
  },

  genius: {
    accessToken: optional('GENIUS_ACCESS_TOKEN'),
  },
} as const;

export type AppConfig = typeof config;
