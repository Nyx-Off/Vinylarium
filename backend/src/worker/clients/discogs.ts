import { config } from '../../config';
import { fetchWithTimeout } from '../../lib/http';

export class DiscogsError extends Error {
  constructor(
    message: string,
    public status: number,
    public notFound = false,
    public rateLimited = false,
  ) {
    super(message);
    this.name = 'DiscogsError';
  }
}

function hasAuth(): boolean {
  return Boolean(
    config.discogs.token || (config.discogs.consumerKey && config.discogs.consumerSecret),
  );
}

function headers(tokenOverride?: string | null): Record<string, string> {
  const h: Record<string, string> = {
    'User-Agent': config.discogs.userAgent,
    Accept: 'application/json',
  };
  if (tokenOverride) {
    h['Authorization'] = `Discogs token=${tokenOverride}`;
  } else if (config.discogs.token) {
    h['Authorization'] = `Discogs token=${config.discogs.token}`;
  } else if (config.discogs.consumerKey && config.discogs.consumerSecret) {
    h['Authorization'] =
      `Discogs key=${config.discogs.consumerKey}, secret=${config.discogs.consumerSecret}`;
  }
  return h;
}

/** Headers for fetching the (un-authenticated) image CDN. */
export function imageHeaders(): Record<string, string> {
  return { 'User-Agent': config.discogs.userAgent };
}

export interface DiscogsSearchResult {
  id: number;
  title: string; // "Artist - Title"
  year: string | null;
  country: string | null;
  formats: string[];
  labels: string[];
  catno: string | null;
  thumb: string | null; // signed CDN thumbnail, loadable from a browser
}

export const discogs = {
  hasAuth,

  /**
   * Live release search (`/database/search`) — requires auth (token or
   * key/secret), Discogs refuses anonymous search. Used by the "add a disc"
   * page; calls are throttled by the API route, NOT by the worker limiter.
   */
  async searchReleases(params: {
    q?: string;
    barcode?: string;
    catno?: string;
    artist?: string;
  }): Promise<DiscogsSearchResult[]> {
    const url = new URL('https://api.discogs.com/database/search');
    url.searchParams.set('type', 'release');
    url.searchParams.set('per_page', '15');
    for (const [k, v] of Object.entries(params)) {
      if (v) url.searchParams.set(k, v);
    }
    const res = await fetchWithTimeout(url.toString(), { headers: headers() });
    if (res.status === 429) throw new DiscogsError('Discogs rate limit hit', 429, false, true);
    if (!res.ok) throw new DiscogsError(`Discogs API returned ${res.status}`, res.status);
    const data = (await res.json()) as {
      results?: {
        id: number;
        title?: string;
        year?: string;
        country?: string;
        format?: string[];
        label?: string[];
        catno?: string;
        thumb?: string;
      }[];
    };
    return (data.results ?? []).map((r) => ({
      id: r.id,
      title: r.title ?? '',
      year: r.year ?? null,
      country: r.country ?? null,
      formats: [...new Set(r.format ?? [])],
      labels: (r.label ?? []).slice(0, 2),
      catno: r.catno ?? null,
      thumb: r.thumb || null,
    }));
  },

  /**
   * One page of a user's Discogs collection (folder 0 = "All"). A personal
   * token is required to read a PRIVATE collection — pass the user's own
   * token; public collections work with the server credentials.
   */
  async getCollectionPage(
    username: string,
    page: number,
    token?: string | null,
  ): Promise<{ pages: number; items: number; releases: any[] }> {
    const url = new URL(
      `https://api.discogs.com/users/${encodeURIComponent(username)}/collection/folders/0/releases`,
    );
    url.searchParams.set('per_page', '100');
    url.searchParams.set('page', String(page));
    const res = await fetchWithTimeout(url.toString(), { headers: headers(token) });
    if (res.status === 429) throw new DiscogsError('Discogs rate limit hit', 429, false, true);
    if (res.status === 404) throw new DiscogsError('Utilisateur Discogs introuvable', 404, true);
    if (res.status === 401 || res.status === 403)
      throw new DiscogsError(
        'Collection privée — renseignez votre jeton Discogs personnel dans le profil',
        res.status,
      );
    if (!res.ok) throw new DiscogsError(`Discogs API returned ${res.status}`, res.status);
    const data = (await res.json()) as any;
    return {
      pages: data?.pagination?.pages ?? 1,
      items: data?.pagination?.items ?? 0,
      releases: Array.isArray(data?.releases) ? data.releases : [],
    };
  },

  /**
   * Original release year of the music, from the master (`/masters/{id}`).
   * A release's own `year` is the year of THAT pressing; the master carries
   * the year the album first came out. 404/missing year → null.
   */
  async getMasterYear(id: number): Promise<number | null> {
    const res = await fetchWithTimeout(`https://api.discogs.com/masters/${id}`, {
      headers: headers(),
    });
    if (res.status === 429) throw new DiscogsError('Discogs rate limit hit', 429, false, true);
    if (res.status === 404) return null;
    if (!res.ok) throw new DiscogsError(`Discogs API returned ${res.status}`, res.status);
    const data = (await res.json()) as { year?: number };
    return typeof data.year === 'number' && data.year > 0 ? data.year : null;
  },

  async getRelease(id: number): Promise<any> {
    // curr_abbr makes Discogs return lowest_price in our configured currency.
    const curr = encodeURIComponent(config.discogs.currency);
    const res = await fetchWithTimeout(`https://api.discogs.com/releases/${id}?curr_abbr=${curr}`, {
      headers: headers(),
    });
    if (res.status === 429) {
      throw new DiscogsError('Discogs rate limit hit', 429, false, true);
    }
    if (res.status === 404) {
      throw new DiscogsError('Release not found on Discogs', 404, true);
    }
    if (!res.ok) {
      throw new DiscogsError(`Discogs API returned ${res.status}`, res.status);
    }
    return res.json();
  },
};
