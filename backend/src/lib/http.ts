/**
 * fetch() with a hard timeout. Without this, a hung Discogs/CDN/Genius
 * connection blocks a worker job forever and the release stays stuck on
 * "ENRICHING" with no progress.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 15_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
