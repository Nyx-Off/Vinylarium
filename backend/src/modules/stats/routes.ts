import { FastifyInstance } from 'fastify';
import { prisma } from '../../db/prisma';

export async function statsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

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
