import { config } from '../../config';
import { fetchWithTimeout } from '../../lib/http';

export class MusicBrainzError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryable = false,
  ) {
    super(message);
    this.name = 'MusicBrainzError';
  }
}

export interface MbArtist {
  mbid: string;
  name: string;
  score: number; // 0..100 search relevance
  type: string | null; // "Group" | "Person" | ...
  country: string | null; // ISO 3166-1 alpha-2 of the artist's area
  areaName: string | null; // e.g. "France"
  beginAreaName: string | null; // founding city, e.g. "Paris"
}

function headers(): Record<string, string> {
  // MusicBrainz requires a meaningful User-Agent; no token needed.
  return { 'User-Agent': config.musicbrainz.userAgent, Accept: 'application/json' };
}

// Inside a quoted Lucene phrase only `"` and `\` are special.
function escapePhrase(s: string): string {
  return s.replace(/[\\"]/g, '\\$&');
}

export const musicbrainz = {
  /** Search artists by name. Results come back sorted by MusicBrainz score. */
  async searchArtists(name: string, limit = 8): Promise<MbArtist[]> {
    const query = `artist:"${escapePhrase(name)}"`;
    const url = `https://musicbrainz.org/ws/2/artist?query=${encodeURIComponent(query)}&fmt=json&limit=${limit}`;
    const res = await fetchWithTimeout(url, { headers: headers() });
    if (res.status === 429 || res.status === 503) {
      throw new MusicBrainzError('MusicBrainz rate limit hit', res.status, true);
    }
    if (!res.ok) {
      throw new MusicBrainzError(`MusicBrainz API returned ${res.status}`, res.status, res.status >= 500);
    }
    const data: any = await res.json();
    const artists: any[] = Array.isArray(data?.artists) ? data.artists : [];
    return artists.map((a) => ({
      mbid: String(a.id ?? ''),
      name: a.name ?? '',
      score: typeof a.score === 'number' ? a.score : 0,
      type: a.type ?? null,
      country: a.country ?? null,
      areaName: a.area?.name ?? null,
      beginAreaName: a['begin-area']?.name ?? null,
    }));
  },
};
