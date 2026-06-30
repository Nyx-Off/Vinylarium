import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
import { notFound } from '../../lib/errors';
import { assertShareToken } from '../../lib/public-share';
import { buildReleaseOrderBy } from '../releases/query';
import { releaseDetailInclude, toDetail, toListItem } from '../releases/serialize';

// Unauthenticated, READ-ONLY view of the collection behind a share token.
// No `authenticate` hook here — the token IS the authorization. Every route
// validates it first and only ever exposes non-hidden releases; personal data
// (notes, rating, storage) is stripped from the public detail.
export async function publicRoutes(app: FastifyInstance) {
  async function guard(token: string) {
    try {
      await assertShareToken(token);
    } catch {
      throw notFound('Lien de partage invalide ou désactivé');
    }
  }

  app.get('/:token', async (req) => {
    const { token } = z.object({ token: z.string() }).parse(req.params);
    await guard(token);
    const total = await prisma.release.count({ where: { hidden: false } });
    return { name: 'Vinylarium', total };
  });

  app.get('/:token/releases', async (req) => {
    const { token } = z.object({ token: z.string() }).parse(req.params);
    await guard(token);
    const qp = z
      .object({
        q: z.string().trim().min(1).optional(),
        sort: z
          .enum(['addedDesc', 'addedAsc', 'title', 'titleDesc', 'artist', 'artistDesc', 'yearAsc', 'yearDesc', 'ratingDesc'])
          .default('addedDesc'),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(120).default(60),
      })
      .parse(req.query);

    // Public listing is intentionally narrow: search + sort + paging, never
    // hidden, no cross-filters.
    const where = {
      hidden: false,
      ...(qp.q
        ? {
            OR: [
              { title: { contains: qp.q, mode: 'insensitive' as const } },
              { artistDisplay: { contains: qp.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [total, items] = await Promise.all([
      prisma.release.count({ where }),
      prisma.release.findMany({
        where,
        orderBy: buildReleaseOrderBy(qp.sort),
        skip: (qp.page - 1) * qp.pageSize,
        take: qp.pageSize,
      }),
    ]);
    return {
      items: items.map(toListItem),
      total,
      page: qp.page,
      pageSize: qp.pageSize,
      pageCount: Math.ceil(total / qp.pageSize),
    };
  });

  app.get('/:token/releases/:id', async (req) => {
    const { token, id } = z.object({ token: z.string(), id: z.string() }).parse(req.params);
    await guard(token);
    const release = await prisma.release.findFirst({
      where: { id, hidden: false },
      include: releaseDetailInclude,
    });
    if (!release) throw notFound('Disque introuvable');
    const detail = toDetail(release) as Record<string, unknown>;
    // Strip personal data from the public sheet.
    delete detail.notes;
    delete detail.rating;
    delete detail.storage;
    delete detail.collectionFolder;
    return detail;
  });
}
