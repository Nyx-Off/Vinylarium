import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
import { badRequest, notFound } from '../../lib/errors';

const partsSchema = {
  label: z.string().trim().max(200).optional(),
  furniture: z.string().trim().max(120).nullish(),
  shelf: z.string().trim().max(120).nullish(),
  column: z.string().trim().max(120).nullish(),
  row: z.string().trim().max(120).nullish(),
  bin: z.string().trim().max(120).nullish(),
  note: z.string().trim().max(500).nullish(),
  sortOrder: z.number().int().optional(),
};

function composeLabel(p: { label?: string; furniture?: string | null; shelf?: string | null; column?: string | null; row?: string | null; bin?: string | null }): string {
  if (p.label && p.label.trim()) return p.label.trim();
  const parts = [p.furniture, p.shelf, p.column, p.row, p.bin].filter((x) => x && x.trim());
  return parts.join(' / ');
}

export async function storageRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/', async () => {
    const locations = await prisma.storageLocation.findMany({
      include: { _count: { select: { releases: true } } },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
    return {
      locations: locations.map((l) => ({
        id: l.id,
        label: l.label,
        furniture: l.furniture,
        shelf: l.shelf,
        column: l.column,
        row: l.row,
        bin: l.bin,
        note: l.note,
        sortOrder: l.sortOrder,
        releaseCount: l._count.releases,
      })),
    };
  });

  app.post('/', async (req) => {
    const body = z.object(partsSchema).parse(req.body);
    const label = composeLabel(body);
    if (!label) throw badRequest('A label or at least one location field is required');
    const loc = await prisma.storageLocation.create({
      data: {
        label,
        furniture: body.furniture ?? null,
        shelf: body.shelf ?? null,
        column: body.column ?? null,
        row: body.row ?? null,
        bin: body.bin ?? null,
        note: body.note ?? null,
        sortOrder: body.sortOrder ?? 0,
      },
    });
    return loc;
  });

  app.patch('/:id', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z.object(partsSchema).parse(req.body);
    const existing = await prisma.storageLocation.findUnique({ where: { id } });
    if (!existing) throw notFound('Location not found');

    const merged = {
      label: body.label,
      furniture: body.furniture ?? existing.furniture,
      shelf: body.shelf ?? existing.shelf,
      column: body.column ?? existing.column,
      row: body.row ?? existing.row,
      bin: body.bin ?? existing.bin,
    };
    const loc = await prisma.storageLocation.update({
      where: { id },
      data: {
        label: composeLabel(merged) || existing.label,
        furniture: body.furniture ?? undefined,
        shelf: body.shelf ?? undefined,
        column: body.column ?? undefined,
        row: body.row ?? undefined,
        bin: body.bin ?? undefined,
        note: body.note ?? undefined,
        sortOrder: body.sortOrder ?? undefined,
      },
    });
    return loc;
  });

  app.delete('/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    await prisma.storageLocation.delete({ where: { id } }).catch(() => {
      throw notFound('Location not found');
    });
    return reply.status(204).send();
  });
}
