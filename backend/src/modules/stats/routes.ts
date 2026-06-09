import { FastifyInstance } from 'fastify';
import { prisma } from '../../db/prisma';
import { config } from '../../config';
import { fetchWithTimeout } from '../../lib/http';
import { geoForCountry } from '../../lib/countries';

type IntegrationStatus = {
  name: string;
  configured: boolean;
  ok: boolean;
  detail: string;
};

async function probe(url: string, headers: Record<string, string>): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(url, { headers }, 6_000);
    return res.ok;
  } catch {
    return false;
  }
}

export async function statsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // ── Integration / API health ──────────────────────────────────────────
  app.get('/integrations', async () => {
    const ua = config.discogs.userAgent;

    // Discogs
    const discogsConfigured = Boolean(
      config.discogs.token || (config.discogs.consumerKey && config.discogs.consumerSecret),
    );
    const discogsHeaders: Record<string, string> = { 'User-Agent': ua };
    if (config.discogs.token) discogsHeaders.Authorization = `Discogs token=${config.discogs.token}`;
    else if (config.discogs.consumerKey)
      discogsHeaders.Authorization = `Discogs key=${config.discogs.consumerKey}, secret=${config.discogs.consumerSecret}`;

    // Genius
    const geniusConfigured = Boolean(config.genius.accessToken);

    const [discogsOk, geniusOk] = await Promise.all([
      probe('https://api.discogs.com/', discogsHeaders),
      geniusConfigured
        ? probe('https://api.genius.com/search?q=test', {
            Authorization: `Bearer ${config.genius.accessToken}`,
          })
        : Promise.resolve(false),
    ]);

    const integrations: IntegrationStatus[] = [
      {
        name: 'Discogs',
        configured: discogsConfigured,
        ok: discogsOk,
        detail: !discogsOk
          ? 'Injoignable'
          : discogsConfigured
            ? 'Connecté (quota authentifié)'
            : 'Connecté sans jeton (quota réduit, 25 req/min)',
      },
      {
        name: 'Genius',
        configured: geniusConfigured,
        ok: geniusOk,
        detail: !geniusConfigured
          ? 'Aucun jeton (GENIUS_ACCESS_TOKEN)'
          : geniusOk
            ? 'Connecté — paroles activées'
            : 'Jeton invalide ou injoignable',
      },
      {
        name: 'MusicBrainz',
        configured: false,
        ok: false,
        detail: 'Pas encore implémenté',
      },
    ];

    return { integrations };
  });

  // ── Geographic origins for the globe ──────────────────────────────────
  app.get('/origins', async () => {
    const grouped = await prisma.release.groupBy({
      by: ['country'],
      where: { country: { not: null } },
      _count: { _all: true },
    });

    // Several Discogs strings can map to the same point ("US"/"USA"); merge them.
    const merged = new Map<string, { name: string; code: string; lat: number; lng: number; count: number }>();
    for (const row of grouped) {
      const geo = row.country ? geoForCountry(row.country) : null;
      if (!geo) continue;
      const existing = merged.get(geo.code);
      if (existing) {
        existing.count += row._count._all;
      } else {
        merged.set(geo.code, {
          name: row.country!,
          code: geo.code,
          lat: geo.lat,
          lng: geo.lng,
          count: row._count._all,
        });
      }
    }

    return { origins: [...merged.values()].sort((a, b) => b.count - a.count) };
  });

  app.get('/', async () => {
    const [releases, artists, labels, enrichedPending, byDecade, topGenres, topCountries, live] =
      await Promise.all([
        prisma.release.count(),
        prisma.artist.count(),
        prisma.label.count(),
        prisma.release.count({ where: { enrichmentStatus: { in: ['PENDING', 'QUEUED', 'ENRICHING'] } } }),
        prisma.release.groupBy({
          by: ['decade'],
          where: { decade: { not: null } },
          _count: { _all: true },
          orderBy: { decade: 'asc' },
        }),
        prisma.genre.findMany({
          include: { _count: { select: { releases: true } } },
          orderBy: { releases: { _count: 'desc' } },
          take: 10,
        }),
        prisma.release.groupBy({
          by: ['country'],
          where: { country: { not: null } },
          _count: { _all: true },
          orderBy: { _count: { country: 'desc' } },
          take: 12,
        }),
        prisma.release.count({ where: { isLive: true } }),
      ]);

    return {
      totals: { releases, artists, labels, live, pendingEnrichment: enrichedPending },
      byDecade: byDecade.map((d) => ({ decade: d.decade, count: d._count._all })),
      topGenres: topGenres.map((g) => ({ name: g.name, count: g._count.releases })),
      topCountries: topCountries.map((c) => ({ name: c.country, count: c._count._all })),
    };
  });
}
