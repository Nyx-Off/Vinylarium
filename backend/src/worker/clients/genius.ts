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

/**
 * Genius rate-limits sustained traffic with HTTP 429. Unlike an ordinary miss
 * (which means "this song has no page"), a 429 means every further call is
 * pointless — callers must abort and let BullMQ retry the job later instead of
 * silently storing nothing.
 */
export class GeniusRateLimitError extends Error {
  constructor() {
    super('Genius rate limit (HTTP 429)');
    this.name = 'GeniusRateLimitError';
  }
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

/** A candidate Genius song, kept with how strongly it matched so the best wins. */
interface ScoredHit extends GeniusHit {
  songId: number;
  titleScore: number; // 0 reject · 1 partial · 2 base exact · 3 exact
  artistScore: number; // 0 reject · 1 token · 1.5 overlap · 2 primary exact
  score: number;
}

/** How well a hit's title matches the wanted track title (0 = reject). */
function titleScore(result: any, wantedTitle: string, wantedBase: string): number {
  const t = normalize(result.title ?? '');
  const tf = normalize(result.title_with_featured ?? '');
  if (t === wantedTitle || tf === wantedTitle) return 3;
  const baseT = normalize(stripParens(result.title ?? ''));
  if (wantedBase.length >= 5 && baseT === wantedBase) return 2;
  if (
    overlaps(wantedTitle, t) ||
    overlaps(wantedTitle, tf) ||
    (wantedBase.length >= 5 && overlaps(wantedBase, baseT))
  )
    return 1;
  return 0;
}

/** How well a hit's artist matches the wanted artist (0 = reject). */
function artistScore(result: any, wantedArtist: string): number {
  const primary = normalize(result.primary_artist?.name ?? '');
  // artist_names carries features and joined credits ("A & B"); a token check
  // covers multi-artist displays where neither string contains the other.
  const hitArtists = normalize(`${result.primary_artist?.name ?? ''} ${result.artist_names ?? ''}`);
  if (primary === wantedArtist) return 2;
  if (overlaps(wantedArtist, hitArtists)) return 1.5;
  if (wantedArtist.split(' ').some((t) => t.length >= 3 && hitArtists.includes(t))) return 1;
  return 0;
}

/** Run one Genius search query and return its raw song hits (throws on 429). */
async function rawSearch(query: string): Promise<any[]> {
  if (!hasAuth() || !query.trim()) return [];
  const res = await fetchWithTimeout(
    `https://api.genius.com/search?q=${encodeURIComponent(query.trim())}`,
    { headers: { Authorization: `Bearer ${config.genius.accessToken}` } },
    12_000,
  );
  if (res.status === 429) throw new GeniusRateLimitError();
  if (!res.ok) return [];
  const json: any = await res.json();
  return (json?.response?.hits ?? []).filter(
    (h: any) => h?.type === 'song' && h?.result?.url && h?.result?.id,
  );
}

/**
 * Score raw hits against what we asked for. Genius search is fuzzy and its top
 * hit can be a completely unrelated song, so a hit is only kept when BOTH the
 * title and the artist line up — and among the kept ones the best title+artist
 * match wins, not merely the first one Genius returned (a live/remaster/cover
 * often slips ahead of the original). Returns candidates best-first.
 */
function scoreHits(hits: any[], askedArtist: string, title: string): ScoredHit[] {
  const wantedTitle = normalize(title);
  const wantedBase = normalize(stripParens(title));
  const wantedArtist = normalize(askedArtist);

  const scored: { h: ScoredHit; i: number }[] = [];
  hits.forEach((hit, i) => {
    const result = hit.result;
    const ts = titleScore(result, wantedTitle, wantedBase);
    const as = artistScore(result, wantedArtist);
    if (ts === 0 || as === 0) return;
    scored.push({
      h: {
        songId: result.id,
        url: result.url,
        title: result.title ?? title,
        artist: result.primary_artist?.name ?? askedArtist,
        titleScore: ts,
        artistScore: as,
        score: ts * 10 + as, // title dominates; artist breaks title ties
      },
      i,
    });
  });
  // Best combined score first; keep Genius's own relevance order on exact ties.
  return scored.sort((a, b) => b.h.score - a.h.score || a.i - b.i).map((x) => x.h);
}

/**
 * Find validated candidates for a track, best-first. Genius search is sensitive
 * to phrasing: "<artist> <title>" sometimes returns NOTHING even when the song
 * is indexed (a joined "A & B" credit, or just an unlucky phrase), while the
 * title-first or title-only phrasing surfaces it. So try progressively and stop
 * at the first phrasing that yields a validated candidate — scoring still
 * requires title AND artist to match, so the title-only query stays safe.
 */
async function searchScored(artist: string, title: string): Promise<ScoredHit[]> {
  if (!hasAuth()) return [];
  const askedArtist = cleanArtist(artist);
  const seen = new Set<string>();
  const queries: string[] = [];
  for (const raw of [`${askedArtist} ${title}`, `${title} ${askedArtist}`, title]) {
    const q = raw.trim();
    const key = normalize(q);
    if (!q || seen.has(key)) continue;
    seen.add(key);
    queries.push(q);
  }
  for (const q of queries) {
    const candidates = scoreHits(await rawSearch(q), askedArtist, title);
    if (candidates.length > 0) return candidates;
  }
  return [];
}

/** Backwards-compatible single best hit (used by callers that don't disambiguate). */
async function search(artist: string, title: string): Promise<GeniusHit | null> {
  const [best] = await searchScored(artist, title);
  return best ? { url: best.url, title: best.title, artist: best.artist } : null;
}

/** Album name carried by a Genius song, or null. Costs one API call. */
async function songAlbumName(songId: number): Promise<string | null> {
  const song = (await apiGet(`/songs/${songId}?text_format=plain`))?.response?.song;
  return song?.album?.name ?? null;
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

/**
 * Inner HTML of every div whose opening tag matches `open`. Genius nests divs
 * inside its lyrics containers (contributors/translations header, inline ads),
 * so a non-greedy `.*?<\/div>` both truncates the lyrics at the first nested
 * close tag and leaks header junk — div depth has to be balanced by hand.
 */
function divContents(html: string, open: RegExp): string[] {
  const out: string[] = [];
  const openRe = new RegExp(open.source, 'gis');
  for (let m = openRe.exec(html); m; m = openRe.exec(html)) {
    const start = m.index + m[0].length;
    const tags = /<div\b[^>]*>|<\/div\s*>/gi;
    tags.lastIndex = start;
    let depth = 1;
    let end = -1;
    for (let t = tags.exec(html); t; t = tags.exec(html)) {
      depth += t[0].startsWith('</') ? -1 : 1;
      if (depth === 0) {
        end = t.index;
        openRe.lastIndex = tags.lastIndex;
        break;
      }
    }
    if (end < 0) break; // malformed tail — keep what was already collected
    out.push(html.slice(start, end));
  }
  return out;
}

/** Drop the non-lyrics blocks Genius embeds in the containers (header, ads). */
function stripExcludedDivs(inner: string): string {
  const openRe = /<div\b[^>]*data-exclude-from-selection="true"[^>]*>/gi;
  let out = '';
  let cursor = 0;
  for (let m = openRe.exec(inner); m; m = openRe.exec(inner)) {
    out += inner.slice(cursor, m.index);
    const tags = /<div\b[^>]*>|<\/div\s*>/gi;
    tags.lastIndex = m.index + m[0].length;
    let depth = 1;
    let t: RegExpExecArray | null = null;
    while (depth > 0 && (t = tags.exec(inner))) depth += t[0].startsWith('</') ? -1 : 1;
    cursor = depth === 0 && t ? tags.lastIndex : inner.length;
    openRe.lastIndex = cursor;
  }
  return out + inner.slice(cursor);
}

/** Scrape the lyrics text from a Genius song page. */
async function scrape(url: string): Promise<string | null> {
  const res = await fetchWithTimeout(url, { headers: { 'User-Agent': config.discogs.userAgent } }, 15_000);
  if (res.status === 429) throw new GeniusRateLimitError();
  if (!res.ok) return null;
  const html = await res.text();

  // Modern Genius wraps each block in a div[data-lyrics-container="true"].
  const blocks = divContents(html, /<div\b[^>]*data-lyrics-container="true"[^>]*>/);
  if (blocks.length === 0) return null;

  const text = blocks
    .map((b) => decodeEntities(stripExcludedDivs(b)))
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
  if (res.status === 429) throw new GeniusRateLimitError();
  if (!res.ok) return null;
  return res.json();
}

export const genius = {
  hasAuth,
  search,

  /**
   * Search then scrape; returns the lyrics text + source URL, or null.
   *
   * When the release's album is known it is used to DISAMBIGUATE: a single song
   * routinely appears on Genius several times (single, album version, remaster,
   * live, cover) and the title+artist score alone can't tell them apart. So if
   * the top candidate isn't an unambiguous exact match, the album of the best
   * few candidates is checked (one API call each) and the one whose album lines
   * up with the disc wins — falling back to the top-scored hit when none match.
   */
  async getLyrics(
    artist: string,
    title: string,
    album?: string,
  ): Promise<{ text: string; url: string } | null> {
    const candidates = await searchScored(artist, title);
    if (candidates.length === 0) return null;

    let chosen = candidates[0];
    const wantedAlbum = album ? normalize(stripParens(album)) : '';
    const ambiguous =
      candidates.length > 1 &&
      (chosen.titleScore < 3 || chosen.artistScore < 2 || candidates[1].score === chosen.score);
    if (wantedAlbum.length >= 3 && ambiguous) {
      for (const c of candidates.slice(0, 4)) {
        let name: string | null = null;
        try {
          name = await songAlbumName(c.songId);
        } catch (e) {
          if (e instanceof GeniusRateLimitError) throw e;
        }
        await sleep(300);
        if (!name) continue;
        const got = normalize(stripParens(name));
        if (got === wantedAlbum || overlaps(wantedAlbum, got)) {
          chosen = c;
          break;
        }
      }
    }

    const text = await scrape(chosen.url);
    return text ? { text, url: chosen.url } : null;
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
