import { config } from '../../config';

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

function headers(): Record<string, string> {
  const h: Record<string, string> = {
    'User-Agent': config.discogs.userAgent,
    Accept: 'application/json',
  };
  if (config.discogs.token) h['Authorization'] = `Discogs token=${config.discogs.token}`;
  return h;
}

/** Headers for fetching the (un-authenticated) image CDN. */
export function imageHeaders(): Record<string, string> {
  return { 'User-Agent': config.discogs.userAgent };
}

export const discogs = {
  hasToken: () => Boolean(config.discogs.token),

  async getRelease(id: number): Promise<any> {
    const res = await fetch(`https://api.discogs.com/releases/${id}`, { headers: headers() });
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
