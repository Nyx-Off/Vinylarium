import { config } from '../../config';
import { fetchWithTimeout } from '../../lib/http';

/**
 * Genius integration. The official API only exposes search + metadata (lyrics
 * are not returned for licensing reasons), so the text is scraped from the
 * public song page. Both steps are best-effort: any failure returns null.
 */

export interface GeniusHit {
  url: string;
  title: string;
  artist: string;
}

function hasAuth(): boolean {
  return Boolean(config.genius.accessToken);
}

/** Search for the best-matching song page. */
async function search(artist: string, title: string): Promise<GeniusHit | null> {
  if (!hasAuth()) return null;
  const q = encodeURIComponent(`${artist} ${title}`.trim());
  const res = await fetchWithTimeout(
    `https://api.genius.com/search?q=${q}`,
    { headers: { Authorization: `Bearer ${config.genius.accessToken}` } },
    12_000,
  );
  if (!res.ok) return null;
  const json: any = await res.json();
  const hits: any[] = json?.response?.hits ?? [];
  const hit = hits.find((h) => h?.type === 'song') ?? hits[0];
  const result = hit?.result;
  if (!result?.url) return null;
  return {
    url: result.url,
    title: result.title ?? title,
    artist: result.primary_artist?.name ?? artist,
  };
}

function decodeEntities(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

/** Scrape the lyrics text from a Genius song page. */
async function scrape(url: string): Promise<string | null> {
  const res = await fetchWithTimeout(url, { headers: { 'User-Agent': config.discogs.userAgent } }, 15_000);
  if (!res.ok) return null;
  const html = await res.text();

  // Modern Genius wraps each block in a div[data-lyrics-container="true"].
  const blocks = [...html.matchAll(/<div[^>]*data-lyrics-container="true"[^>]*>(.*?)<\/div>/gis)];
  if (blocks.length === 0) return null;

  const text = blocks
    .map((m) => decodeEntities(m[1]))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text.length > 0 ? text : null;
}

export const genius = {
  hasAuth,
  search,

  /** Search then scrape; returns the lyrics text + source URL, or null. */
  async getLyrics(artist: string, title: string): Promise<{ text: string; url: string } | null> {
    const hit = await search(artist, title);
    if (!hit) return null;
    const text = await scrape(hit.url);
    return text ? { text, url: hit.url } : null;
  },
};
