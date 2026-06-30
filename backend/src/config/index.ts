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
    // Either a personal access token, or an app Consumer key+secret (key/secret
    // grants the authenticated rate limit + the images[] array without a user).
    token: optional('DISCOGS_TOKEN'),
    consumerKey: optional('DISCOGS_CONSUMER_KEY'),
    consumerSecret: optional('DISCOGS_CONSUMER_SECRET'),
    userAgent: optional('DISCOGS_USER_AGENT', 'Vinylarium/0.1 +https://github.com/Nyx-Off/Vinylarium'),
    // Currency for marketplace prices (lowest_price), passed as curr_abbr to the
    // release endpoint. Discogs accepts USD/GBP/EUR/CAD/AUD/JPY/CHF/MXN/BRL/NZD/SEK/ZAR.
    currency: optional('DISCOGS_CURRENCY', 'EUR'),
  },

  musicbrainz: {
    userAgent: optional('MUSICBRAINZ_USER_AGENT', 'Vinylarium/0.1 ( https://github.com/Nyx-Off/Vinylarium )'),
  },

  genius: {
    accessToken: optional('GENIUS_ACCESS_TOKEN'),
  },

  anecdotes: {
    // Target language for Genius album descriptions (empty string disables
    // translation and keeps the original English).
    translateTo: optional('ANECDOTE_LANG', 'fr'),
  },

  spotify: {
    // One server-side Spotify app; each USER connects their own account via the
    // OAuth Authorization Code flow. Register the app + its redirect URI at
    // https://developer.spotify.com. Admin-overridable from Settings.
    clientId: optional('SPOTIFY_CLIENT_ID'),
    clientSecret: optional('SPOTIFY_CLIENT_SECRET'),
    // The OAuth redirect URI registered in the Spotify app. Default: the
    // project's static "relay" page (GitHub Pages) that bounces the browser
    // back to this instance — so a LAN-only http install needs no HTTPS/tunnel
    // (Spotify only allows https or 127.0.0.1 as a redirect, not a LAN IP).
    // Override (e.g. with your own https domain's /spotify/callback) to skip the
    // relay. `|| default` so an empty env var keeps the default.
    redirectUri:
      optional('SPOTIFY_REDIRECT_URI').trim() ||
      'https://nyx-off.github.io/Vinylarium/spotify/',
  },

  update: {
    // GitHub repo the daily/manual update check compares against.
    repo: optional('UPDATE_REPO', 'Nyx-Off/Vinylarium'),
    branch: optional('UPDATE_BRANCH', 'main'),
    // Host checkout's .git, mounted read-only into the backend container —
    // the local commit is read from there (no git binary needed).
    gitDir: optional('GIT_DIR_PATH', '/repo/.git'),
    // Plain-text VERSION file from the deployed checkout (mounted read-only).
    // Compared against the same file on GitHub for the headline update check.
    versionFile: optional('VERSION_FILE_PATH', '/repo/VERSION'),
  },
} as const;

export type AppConfig = typeof config;
