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

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Discogs disambiguation suffixes ("Miki (13)") never appear on Genius. */
const cleanArtist = (s: string) => s.replace(/\s*\(\d+\)\s*$/, '').trim();

/** Parenthetical qualifiers differ between sites ("(Part 1-5)" vs "(Parts I-V)"). */
const stripParens = (s: string) => s.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();

const overlaps = (wanted: string, got: string) =>
  wanted.length > 0 && got.length > 0 && (got.includes(wanted) || wanted.includes(got));

/**
 * Search for the best-matching song page. Genius search is fuzzy and its top
 * hit can be a completely unrelated song, so a hit is only accepted when both
 * the title and the artist line up with what we asked for — no lyrics beats
 * wrong lyrics.
 */
async function search(artist: string, title: string): Promise<GeniusHit | null> {
  if (!hasAuth()) return null;
  const askedArtist = cleanArtist(artist);
  const q = encodeURIComponent(`${askedArtist} ${title}`.trim());
  const res = await fetchWithTimeout(
    `https://api.genius.com/search?q=${q}`,
    { headers: { Authorization: `Bearer ${config.genius.accessToken}` } },
    12_000,
  );
  if (!res.ok) return null;
  const json: any = await res.json();
  const hits: any[] = (json?.response?.hits ?? []).filter(
    (h: any) => h?.type === 'song' && h?.result?.url,
  );

  const wantedTitle = normalize(title);
  const wantedBase = normalize(stripParens(title));
  const wantedArtist = normalize(askedArtist);
  for (const hit of hits) {
    const result = hit.result;
    const titleOk =
      overlaps(wantedTitle, normalize(result.title ?? '')) ||
      overlaps(wantedTitle, normalize(result.title_with_featured ?? '')) ||
      (wantedBase.length >= 5 && overlaps(wantedBase, normalize(stripParens(result.title ?? ''))));
    if (!titleOk) continue;
    // artist_names carries features and joined credits ("A & B"); a token
    // check covers multi-artist displays where neither string contains the other.
    const hitArtists = normalize(`${result.primary_artist?.name ?? ''} ${result.artist_names ?? ''}`);
    const artistOk =
      overlaps(wantedArtist, hitArtists) ||
      wantedArtist.split(' ').some((t) => t.length >= 3 && hitArtists.includes(t));
    if (!artistOk) continue;
    return {
      url: result.url,
      title: result.title ?? title,
      artist: result.primary_artist?.name ?? artist,
    };
  }
  return null;
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

export interface GeniusAlbumInfo {
  name: string;
  url: string;
  description: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function apiGet(path: string): Promise<any | null> {
  const res = await fetchWithTimeout(
    `https://api.genius.com${path}`,
    { headers: { Authorization: `Bearer ${config.genius.accessToken}` } },
    12_000,
  );
  if (!res.ok) return null;
  return res.json();
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

  /**
   * Album description ("about" annotation). The public API has no album
   * search, so: search songs → song detail gives its album → album detail
   * carries the description. The hit's artist and the album name must both
   * line up with the release to avoid picking up a wrong record. Searching
   * "<artist> <album title>" often misses (Genius indexes songs, not albums),
   * so the release's track titles serve as fallback queries — any confirmed
   * track leads to the same album. Best-effort: null on anything missing.
   */
  async getAlbumInfo(
    artist: string,
    title: string,
    trackTitles: string[] = [],
  ): Promise<GeniusAlbumInfo | null> {
    if (!hasAuth()) return null;
    const askedArtist = cleanArtist(artist);
    const wantedAlbum = normalize(title);
    const wantedArtist = normalize(askedArtist);

    const queries = [title, ...trackTitles.slice(0, 3)].map((t) => `${askedArtist} ${t}`.trim());
    // An exact album-name match beats an inclusion match — "Wish You Were
    // Here 50" (anniversary reissue) must not shadow "Wish You Were Here".
    let albumId: number | null = null;
    let albumName = '';
    let albumUrl = '';
    let fallback: { id: number; name: string; url: string } | null = null;
    outer: for (const query of queries) {
      const found = await apiGet(`/search?q=${encodeURIComponent(query)}`);
      const hits: any[] = (found?.response?.hits ?? []).filter((h: any) => h?.result?.id);
      for (const hit of hits.slice(0, 3)) {
        const hitArtists = normalize(
          `${hit.result.primary_artist?.name ?? ''} ${hit.result.artist_names ?? ''}`,
        );
        const artistOk =
          overlaps(wantedArtist, hitArtists) ||
          wantedArtist.split(' ').some((t) => t.length >= 3 && hitArtists.includes(t));
        if (!artistOk) continue;
        await sleep(300);
        const song = (await apiGet(`/songs/${hit.result.id}?text_format=plain`))?.response?.song;
        const album = song?.album;
        if (!album?.id || !album?.name) continue;
        const got = normalize(album.name);
        if (got === wantedAlbum) {
          albumId = album.id;
          albumName = album.name;
          albumUrl = album.url ?? '';
          break outer;
        }
        if (!fallback && overlaps(wantedAlbum, got)) {
          fallback = { id: album.id, name: album.name, url: album.url ?? '' };
        }
      }
      await sleep(300);
    }
    if (!albumId && fallback) {
      albumId = fallback.id;
      albumName = fallback.name;
      albumUrl = fallback.url;
    }
    if (!albumId) return null;

    await sleep(300);
    const album = (await apiGet(`/albums/${albumId}?text_format=plain`))?.response?.album;
    const description: string = album?.description_annotation?.annotations?.[0]?.body?.plain ?? '';
    // Genius uses a lone "?" as the empty-description placeholder.
    if (!description || description.trim().length < 40) return null;
    return {
      name: album?.name ?? albumName,
      url: album?.url ?? albumUrl,
      description: description.trim(),
    };
  },
};
