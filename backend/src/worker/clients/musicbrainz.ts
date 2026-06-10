import { config } from '../../config';
import { fetchWithTimeout } from '../../lib/http';

export class MusicBrainzError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryable = false,
    public notFound = false,
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

export interface MbMember {
  mbid: string | null;
  name: string;
  attributes: string[]; // instruments / roles ("guitar", "lead vocals", "original"…)
  begin: string | null;
  end: string | null;
  ended: boolean;
}

export interface MbArtistDetail {
  mbid: string;
  name: string;
  type: string | null;
  beginDate: string | null; // life-span: founding / birth
  endDate: string | null;
  members: MbMember[]; // when the artist is a group
  memberOf: { mbid: string; name: string }[]; // when the artist is a person
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

  /**
   * Full artist lookup with artist-artist relations. "member of band" rels on
   * a group point at its members (direction backward); on a person they point
   * at the bands they belong to (direction forward).
   */
  async getArtist(mbid: string): Promise<MbArtistDetail> {
    const url = `https://musicbrainz.org/ws/2/artist/${encodeURIComponent(mbid)}?inc=artist-rels&fmt=json`;
    const res = await fetchWithTimeout(url, { headers: headers() });
    if (res.status === 429 || res.status === 503) {
      throw new MusicBrainzError('MusicBrainz rate limit hit', res.status, true);
    }
    if (res.status === 404) {
      throw new MusicBrainzError('Artist not found on MusicBrainz', 404, false, true);
    }
    if (!res.ok) {
      throw new MusicBrainzError(`MusicBrainz API returned ${res.status}`, res.status, res.status >= 500);
    }
    const data: any = await res.json();
    const rels: any[] = Array.isArray(data?.relations) ? data.relations : [];
    const memberRels = rels.filter((r) => r?.type === 'member of band' && r?.artist?.name);

    return {
      mbid: String(data.id ?? mbid),
      name: data.name ?? '',
      type: data.type ?? null,
      beginDate: data['life-span']?.begin ?? null,
      endDate: data['life-span']?.end ?? null,
      members: memberRels
        .filter((r) => r.direction === 'backward')
        .map((r) => ({
          mbid: r.artist.id ?? null,
          name: r.artist.name,
          attributes: Array.isArray(r.attributes) ? r.attributes : [],
          begin: r.begin ?? null,
          end: r.end ?? null,
          ended: Boolean(r.ended),
        })),
      memberOf: memberRels
        .filter((r) => r.direction === 'forward')
        .map((r) => ({ mbid: r.artist.id ?? '', name: r.artist.name })),
    };
  },
};
