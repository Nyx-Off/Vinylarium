import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
import { config } from '../../config';
import { fetchWithTimeout } from '../../lib/http';
import { geoForCountry, geoForISO } from '../../lib/countries';
import { mediaUrl } from '../../lib/storage';
import { spotifyConfigured } from '../../lib/spotify';
import { isPlaceholderArtist } from '../../lib/text';

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

    const [discogsOk, geniusOk, musicbrainzOk, lrclibOk] = await Promise.all([
      probe('https://api.discogs.com/', discogsHeaders),
      geniusConfigured
        ? probe('https://api.genius.com/search?q=test', {
            Authorization: `Bearer ${config.genius.accessToken}`,
          })
        : Promise.resolve(false),
      // Cheap lookup of a stable entity (the "Various Artists" special artist).
      probe('https://musicbrainz.org/ws/2/artist/89ad4ac3-39f7-470e-963a-56509c546377?fmt=json', {
        'User-Agent': config.musicbrainz.userAgent,
        Accept: 'application/json',
      }),
      // LRCLIB needs no key — just a polite User-Agent. Probe the service root
      // (the API paths can be slow/rate-limited; root is a reliable up signal).
      probe('https://lrclib.net/', {
        'User-Agent': 'Vinylarium (+https://github.com/Nyx-Off/Vinylarium)',
      }),
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
        configured: true, // no token needed, only a User-Agent
        ok: musicbrainzOk,
        detail: musicbrainzOk
          ? 'Connecté — origine des artistes activée'
          : 'Injoignable',
      },
      {
        name: 'LRCLIB',
        configured: true, // free, keyless — complements Genius for lyrics
        ok: lrclibOk,
        detail: lrclibOk ? 'Connecté — paroles complémentaires (sans clé)' : 'Injoignable',
      },
      {
        name: 'Spotify',
        configured: spotifyConfigured(),
        // App-level only: per-user connection happens in each profile's settings.
        ok: spotifyConfigured(),
        detail: spotifyConfigured()
          ? 'Configuré — connectez votre compte dans Paramètres'
          : 'Clés API manquantes (Client ID/Secret)',
      },
    ];

    return { integrations };
  });

  // ── Geographic origins for the globe ──────────────────────────────────
  // mode=artists (default): where the artists/bands come from (MusicBrainz).
  // mode=pressing: where the vinyl itself was pressed (Discogs country field).
  app.get('/origins', async (req) => {
    const { mode } = z
      .object({ mode: z.enum(['artists', 'pressing']).default('artists') })
      .parse(req.query);

    type Bucket = { name: string; code: string; lat: number; lng: number; count: number };
    const merged = new Map<string, Bucket>();

    if (mode === 'artists') {
      // One count per (release, origin country): an album lights up its
      // artist's homeland once, a France+US duo lights up both.
      const links = await prisma.releaseArtist.findMany({
        where: { artist: { originCountryId: { not: null } } },
        select: { releaseId: true, artist: { select: { originCountry: true } } },
      });
      const seen = new Set<string>();
      for (const link of links) {
        const c = link.artist.originCountry;
        if (!c?.code) continue;
        const geo =
          c.latitude != null && c.longitude != null
            ? { lat: c.latitude, lng: c.longitude }
            : geoForISO(c.code);
        if (!geo) continue;
        const key = `${c.code}|${link.releaseId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const existing = merged.get(c.code);
        if (existing) {
          existing.count += 1;
        } else {
          merged.set(c.code, {
            name: geoForISO(c.code)?.name ?? c.name,
            code: c.code,
            lat: geo.lat,
            lng: geo.lng,
            count: 1,
          });
        }
      }
    } else {
      const grouped = await prisma.release.groupBy({
        by: ['country'],
        where: { country: { not: null } },
        _count: { _all: true },
      });
      // Several Discogs strings can map to the same point ("US"/"USA"); merge them.
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
    }

    // Resolution progress, so the UI can say "origins still loading".
    const [resolved, pendingOrigins] = await Promise.all([
      prisma.artist.count({ where: { originStatus: 'FOUND', releases: { some: {} } } }),
      prisma.artist.count({
        where: { originStatus: { in: ['PENDING', 'FAILED'] }, releases: { some: {} } },
      }),
    ]);

    return {
      mode,
      origins: [...merged.values()].sort((a, b) => b.count - a.count),
      artistsResolved: resolved,
      artistsPending: pendingOrigins,
    };
  });

  // ── Chronological timeline ────────────────────────────────────────────
  // Every dated release, oldest first — feeds the /timeline page. Releases
  // without a year can't be placed on the axis; their count is returned so
  // the UI can mention them.
  app.get('/timeline', async () => {
    const [releases, undated] = await Promise.all([
      prisma.release.findMany({
        where: { year: { not: null }, hidden: false },
        orderBy: [{ year: 'asc' }, { artistDisplay: 'asc' }, { title: 'asc' }],
        select: { id: true, title: true, artistDisplay: true, year: true, coverPath: true },
      }),
      prisma.release.count({ where: { year: null, hidden: false } }),
    ]);
    return {
      releases: releases.map((r) => ({
        id: r.id,
        title: r.title,
        artist: r.artistDisplay,
        year: r.year!,
        coverUrl: mediaUrl(r.coverPath),
      })),
      undated,
    };
  });

  app.get('/', async () => {
    const [
      releases,
      artists,
      labels,
      enrichedPending,
      enriched,
      withLyrics,
      rated,
      hidden,
      byDecade,
      topGenres,
      topCountries,
      live,
      topArtistsRaw,
      topLabelsRaw,
      ratingsRaw,
      formatsRaw,
    ] = await Promise.all([
      prisma.release.count(),
      prisma.artist.count(),
      prisma.label.count(),
      prisma.release.count({ where: { enrichmentStatus: { in: ['PENDING', 'QUEUED', 'ENRICHING'] } } }),
      prisma.release.count({ where: { enrichedAt: { not: null } } }),
      prisma.release.count({ where: { lyricsFetchedAt: { not: null } } }),
      prisma.release.count({ where: { rating: { not: null, gt: 0 } } }),
      prisma.release.count({ where: { hidden: true } }),
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
      // Most-represented billed artists. We over-fetch and filter placeholder
      // artists ("Various", "Unknown Artist") that would otherwise dominate.
      prisma.artist.findMany({
        select: { id: true, name: true, _count: { select: { releases: true } } },
        orderBy: { releases: { _count: 'desc' } },
        take: 24,
      }),
      prisma.label.findMany({
        select: { id: true, name: true, _count: { select: { releases: true } } },
        orderBy: { releases: { _count: 'desc' } },
        take: 12,
      }),
      prisma.release.groupBy({
        by: ['rating'],
        where: { rating: { not: null, gt: 0 } },
        _count: { _all: true },
        orderBy: { rating: 'asc' },
      }),
      prisma.releaseFormat.groupBy({
        by: ['name'],
        _count: { _all: true },
        orderBy: { _count: { name: 'desc' } },
        take: 12,
      }),
    ]);

    const topArtists = topArtistsRaw
      .filter((a) => !isPlaceholderArtist(a.name) && a._count.releases > 0)
      .slice(0, 12)
      .map((a) => ({ id: a.id, name: a.name, count: a._count.releases }));

    return {
      totals: {
        releases,
        artists,
        labels,
        live,
        pendingEnrichment: enrichedPending,
        enriched,
        withLyrics,
        rated,
        hidden,
      },
      byDecade: byDecade.map((d) => ({ decade: d.decade, count: d._count._all })),
      topGenres: topGenres.map((g) => ({ name: g.name, count: g._count.releases })),
      topCountries: topCountries.map((c) => ({ name: c.country, count: c._count._all })),
      topArtists,
      topLabels: topLabelsRaw
        .filter((l) => l._count.releases > 0)
        .map((l) => ({ id: l.id, name: l.name, count: l._count.releases })),
      ratings: ratingsRaw.map((r) => ({ rating: r.rating!, count: r._count._all })),
      formats: formatsRaw.map((f) => ({ name: f.name, count: f._count._all })),
    };
  });
}
