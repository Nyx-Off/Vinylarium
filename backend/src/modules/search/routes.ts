import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { RoleCategory } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { mediaUrl } from '../../lib/storage';

// ReleaseFormat.descriptions mixes physical formats with edition qualifiers
// ("Reissue", "Stereo", "Gatefold"…); only the format-like values make sense
// as a search facet (33/45 RPM, LP/EP/Single, sizes).
const FORMAT_FACETS = new Set([
  'LP',
  'EP',
  'Single',
  'Maxi-Single',
  'Mini-Album',
  'Album',
  '33 ⅓ RPM',
  '45 RPM',
  '78 RPM',
  '7"',
  '10"',
  '12"',
]);

export async function searchRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // All facet values for building the advanced-search UI.
  app.get('/facets', async () => {
    const [genres, styles, labels, tags, instruments, storage, countries, decades, formatRows] =
      await Promise.all([
        prisma.genre.findMany({
          include: { _count: { select: { releases: true } } },
          orderBy: { releases: { _count: 'desc' } },
          take: 100,
        }),
        prisma.style.findMany({
          include: { _count: { select: { releases: true } } },
          orderBy: { releases: { _count: 'desc' } },
          take: 150,
        }),
        prisma.label.findMany({
          include: { _count: { select: { releases: true } } },
          orderBy: { releases: { _count: 'desc' } },
          take: 100,
        }),
        prisma.tag.findMany({
          include: { _count: { select: { releases: true } } },
          orderBy: { name: 'asc' },
        }),
        prisma.role.findMany({
          where: { category: RoleCategory.INSTRUMENT, credits: { some: {} } },
          include: { _count: { select: { credits: true } } },
          orderBy: { credits: { _count: 'desc' } },
          take: 100,
        }),
        prisma.storageLocation.findMany({
          include: { _count: { select: { releases: true } } },
          orderBy: { sortOrder: 'asc' },
        }),
        prisma.release.groupBy({
          by: ['country'],
          where: { country: { not: null } },
          _count: { _all: true },
          orderBy: { _count: { country: 'desc' } },
        }),
        prisma.release.groupBy({
          by: ['decade'],
          where: { decade: { not: null } },
          _count: { _all: true },
          orderBy: { decade: 'desc' },
        }),
        prisma.$queryRaw<{ name: string; count: bigint }[]>`
          SELECT d AS name, COUNT(DISTINCT "releaseId") AS count
          FROM "release_formats", unnest("descriptions") AS d
          GROUP BY d ORDER BY count DESC`,
      ]);

    const mapNamed = (rows: any[]) =>
      rows.map((r) => ({ name: r.name, count: r._count.releases }));

    return {
      genres: mapNamed(genres),
      styles: mapNamed(styles),
      labels: mapNamed(labels),
      tags: tags.map((t) => ({ name: t.name, color: t.color, count: t._count.releases })),
      instruments: instruments.map((r) => ({ id: r.id, name: r.name, count: r._count.credits })),
      storageLocations: storage.map((s) => ({
        id: s.id,
        label: s.label,
        count: s._count.releases,
      })),
      countries: countries.map((c) => ({ name: c.country, count: c._count._all })),
      formats: formatRows
        .filter((f) => FORMAT_FACETS.has(f.name))
        .map((f) => ({ name: f.name, count: Number(f.count) })),
      decades: decades
        .filter((d) => d.decade != null)
        .map((d) => ({ decade: d.decade, count: d._count._all })),
    };
  });

  // Artist autocomplete / picker. Returns billed + credited counts.
  app.get('/artists', async (req) => {
    const { q, limit } = z
      .object({ q: z.string().trim().optional(), limit: z.coerce.number().int().min(1).max(100).default(30) })
      .parse(req.query);
    const artists = await prisma.artist.findMany({
      where: q ? { name: { contains: q, mode: 'insensitive' } } : undefined,
      include: { _count: { select: { releases: true, credits: true } } },
      orderBy: [{ releases: { _count: 'desc' } }, { name: 'asc' }],
      take: limit,
    });
    return {
      artists: artists.map((a) => ({
        id: a.id,
        name: a.name,
        imageUrl: mediaUrl(a.imagePath),
        releaseCount: a._count.releases,
        creditCount: a._count.credits,
      })),
    };
  });

  // Full-text search over lyrics — "find the record with these words". Uses the
  // Postgres `lyrics_text_fts` GIN index (migration 20260630120000). Returns the
  // matched track per release with a highlighted snippet, ranked by relevance.
  app.get('/lyrics', async (req) => {
    const { q, limit } = z
      .object({
        q: z.string().trim().min(2),
        limit: z.coerce.number().int().min(1).max(100).default(40),
      })
      .parse(req.query);

    const rows = await prisma.$queryRaw<
      {
        releaseId: string;
        title: string;
        artistDisplay: string;
        coverPath: string | null;
        trackTitle: string | null;
        trackPosition: string | null;
        snippet: string;
        rank: number;
      }[]
    >`
      SELECT l."releaseId",
             r."title",
             r."artistDisplay",
             r."coverPath",
             t."title"    AS "trackTitle",
             t."position" AS "trackPosition",
             ts_headline('simple', l."text", websearch_to_tsquery('simple', ${q}),
               'StartSel=«,StopSel=»,MaxFragments=2,MaxWords=14,MinWords=5,FragmentDelimiter= … ') AS "snippet",
             ts_rank(to_tsvector('simple', l."text"), websearch_to_tsquery('simple', ${q})) AS "rank"
      FROM "lyrics" l
      JOIN "releases" r ON r."id" = l."releaseId"
      LEFT JOIN "tracks" t ON t."id" = l."trackId"
      WHERE to_tsvector('simple', l."text") @@ websearch_to_tsquery('simple', ${q})
      ORDER BY "rank" DESC, r."artistDisplay" ASC
      LIMIT ${limit}
    `;

    return {
      results: rows.map((row) => ({
        releaseId: row.releaseId,
        title: row.title,
        artistDisplay: row.artistDisplay,
        coverUrl: mediaUrl(row.coverPath),
        trackTitle: row.trackTitle,
        trackPosition: row.trackPosition,
        snippet: row.snippet,
      })),
    };
  });

  // Roles grouped by category (for the "filter by role/instrument" UI).
  app.get('/roles', async () => {
    const roles = await prisma.role.findMany({
      where: { credits: { some: {} } },
      include: { _count: { select: { credits: true } } },
      orderBy: [{ category: 'asc' }, { credits: { _count: 'desc' } }],
    });
    return {
      roles: roles.map((r) => ({
        id: r.id,
        name: r.name,
        category: r.category,
        count: r._count.credits,
      })),
    };
  });
}
