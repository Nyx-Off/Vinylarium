import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
import { badRequest, notFound } from '../../lib/errors';
import { coverUrlOf } from '../releases/serialize';

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

// ── 3D furniture ────────────────────────────────────────────────────────────

const FURNITURE_TYPES = ['CUBES', 'CUBE', 'TOWER', 'BAC', 'VITRINE', 'CHEVALET', 'SHELF', 'FRAME'] as const;
type FurnitureType = (typeof FURNITURE_TYPES)[number];

/** Sensible defaults per type (metres + grid) when a piece is created. */
const FURNITURE_DEFAULTS: Record<FurnitureType, { width: number; height: number; depth: number; columns: number; rows: number; name: string }> = {
  CUBES: { width: 0.77, height: 0.77, depth: 0.39, columns: 2, rows: 2, name: 'Cubes' },
  CUBE: { width: 0.39, height: 0.39, depth: 0.39, columns: 1, rows: 1, name: 'Cube' },
  // Fun Generation Vinyl Rack: narrow tower, records upright in stacked bins.
  TOWER: { width: 0.355, height: 0.971, depth: 0.34, columns: 1, rows: 3, name: 'Tour vinyles' },
  BAC: { width: 0.6, height: 0.35, depth: 0.5, columns: 1, rows: 1, name: 'Bac' },
  VITRINE: { width: 0.8, height: 1.8, depth: 0.4, columns: 1, rows: 4, name: 'Vitrine' },
  CHEVALET: { width: 0.4, height: 0.5, depth: 0.3, columns: 1, rows: 1, name: 'Chevalet' },
  SHELF: { width: 1.0, height: 0.3, depth: 0.32, columns: 1, rows: 1, name: 'Étagère' },
  FRAME: { width: 0.35, height: 0.35, depth: 0.04, columns: 1, rows: 1, name: 'Cadre' },
};

const ROOM_SETTING_KEY = 'storageRoom';
const DEFAULT_ROOM = { width: 6, depth: 5 };
const MOUNTS = ['FLOOR', 'WALL_BACK', 'WALL_LEFT'] as const;

// How many covers to ship per cell for the 3D preview (records shown in a bin,
// on a shelf, in a frame…). Kept small to bound payload + textures.
const COVERS_PER_CELL = 10;

function serializeFurniture(f: any) {
  return {
    id: f.id,
    name: f.name,
    type: f.type,
    posX: f.posX,
    posY: f.posY,
    posZ: f.posZ,
    rotation: f.rotation,
    mount: f.mount,
    width: f.width,
    height: f.height,
    depth: f.depth,
    columns: f.columns,
    rows: f.rows,
    color: f.color,
    sortOrder: f.sortOrder,
    // Cells that actually hold records (created on demand), keyed by grid index.
    cells: (f.cells ?? []).map((c: any) => ({
      id: c.id,
      cellX: c.cellX,
      cellY: c.cellY,
      label: c.label,
      note: c.note,
      releaseCount: c._count?.releases ?? 0,
      covers: (c.releases ?? [])
        .map((r: any) => coverUrlOf(r))
        .filter((u: string | null): u is string => !!u)
        .slice(0, COVERS_PER_CELL),
    })),
  };
}

const cellsInclude = {
  cells: {
    include: {
      _count: { select: { releases: true } },
      releases: {
        take: COVERS_PER_CELL,
        orderBy: [{ artistDisplay: 'asc' as const }, { year: 'asc' as const }],
        select: { coverPath: true, thumbUrl: true },
      },
    },
  },
};

export async function storageRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  app.get('/', async () => {
    const locations = await prisma.storageLocation.findMany({
      // Plain (non-furniture) text locations only; cells live under furniture.
      where: { furnitureId: null },
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

  // ── Room config (single shared room) ──────────────────────────────────────

  app.get('/room', async () => {
    const row = await prisma.setting.findUnique({ where: { key: ROOM_SETTING_KEY } });
    const v = (row?.value as any) ?? {};
    return { width: v.width ?? DEFAULT_ROOM.width, depth: v.depth ?? DEFAULT_ROOM.depth };
  });

  app.put('/room', async (req) => {
    const body = z
      .object({ width: z.number().min(1).max(50), depth: z.number().min(1).max(50) })
      .parse(req.body);
    await prisma.setting.upsert({
      where: { key: ROOM_SETTING_KEY },
      create: { key: ROOM_SETTING_KEY, value: body },
      update: { value: body },
    });
    return body;
  });

  // ── Furniture CRUD ────────────────────────────────────────────────────────

  app.get('/furniture', async () => {
    const items = await prisma.furniture.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: cellsInclude,
    });
    return { furniture: items.map(serializeFurniture) };
  });

  app.post('/furniture', async (req) => {
    const body = z
      .object({
        type: z.enum(FURNITURE_TYPES),
        name: z.string().trim().max(120).optional(),
        posX: z.number().optional(),
        posZ: z.number().optional(),
      })
      .parse(req.body);
    const d = FURNITURE_DEFAULTS[body.type];
    const count = await prisma.furniture.count();
    // Frames default to hanging on the back wall at eye level.
    const wallDefault = body.type === 'FRAME';
    const created = await prisma.furniture.create({
      data: {
        type: body.type,
        name: body.name?.trim() || d.name,
        width: d.width,
        height: d.height,
        depth: d.depth,
        columns: d.columns,
        rows: d.rows,
        posX: body.posX ?? 0,
        posZ: body.posZ ?? 0,
        posY: wallDefault ? 1.4 : 0,
        mount: wallDefault ? 'WALL_BACK' : 'FLOOR',
        sortOrder: count,
      },
      include: cellsInclude,
    });
    return serializeFurniture(created);
  });

  app.patch('/furniture/:id', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z
      .object({
        name: z.string().trim().min(1).max(120).optional(),
        type: z.enum(FURNITURE_TYPES).optional(),
        posX: z.number().optional(),
        posY: z.number().min(0).max(10).optional(),
        posZ: z.number().optional(),
        rotation: z.number().optional(),
        mount: z.enum(MOUNTS).optional(),
        width: z.number().min(0.1).max(20).optional(),
        height: z.number().min(0.1).max(10).optional(),
        depth: z.number().min(0.05).max(10).optional(),
        columns: z.number().int().min(1).max(20).optional(),
        rows: z.number().int().min(1).max(20).optional(),
        color: z.string().trim().max(20).nullish(),
        sortOrder: z.number().int().optional(),
      })
      .parse(req.body);
    const existing = await prisma.furniture.findUnique({ where: { id } });
    if (!existing) throw notFound('Furniture not found');

    const newCols = body.columns ?? existing.columns;
    const newRows = body.rows ?? existing.rows;
    // Shrinking the grid orphans out-of-range cells: drop the empty ones and
    // detach (keep) any that still hold records so assignments aren't lost.
    if (newCols < existing.columns || newRows < existing.rows) {
      const outOfRange = await prisma.storageLocation.findMany({
        where: {
          furnitureId: id,
          OR: [{ cellX: { gte: newCols } }, { cellY: { gte: newRows } }],
        },
        include: { _count: { select: { releases: true } } },
      });
      const emptyIds = outOfRange.filter((c) => c._count.releases === 0).map((c) => c.id);
      const keepIds = outOfRange.filter((c) => c._count.releases > 0).map((c) => c.id);
      if (emptyIds.length) await prisma.storageLocation.deleteMany({ where: { id: { in: emptyIds } } });
      if (keepIds.length)
        await prisma.storageLocation.updateMany({
          where: { id: { in: keepIds } },
          data: { furnitureId: null, cellX: null, cellY: null },
        });
    }

    const updated = await prisma.furniture.update({
      where: { id },
      data: {
        name: body.name ?? undefined,
        type: body.type ?? undefined,
        posX: body.posX ?? undefined,
        posY: body.posY ?? undefined,
        posZ: body.posZ ?? undefined,
        rotation: body.rotation ?? undefined,
        mount: body.mount ?? undefined,
        width: body.width ?? undefined,
        height: body.height ?? undefined,
        depth: body.depth ?? undefined,
        columns: body.columns ?? undefined,
        rows: body.rows ?? undefined,
        color: body.color === undefined ? undefined : body.color,
        sortOrder: body.sortOrder ?? undefined,
      },
      include: cellsInclude,
    });
    return serializeFurniture(updated);
  });

  app.delete('/furniture/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const exists = await prisma.furniture.findUnique({ where: { id } });
    if (!exists) throw notFound('Furniture not found');
    // Empty cells vanish with the piece; cells holding records are detached
    // (FK is ON DELETE SET NULL) so the records stay "stored somewhere".
    const cells = await prisma.storageLocation.findMany({
      where: { furnitureId: id },
      include: { _count: { select: { releases: true } } },
    });
    const emptyIds = cells.filter((c) => c._count.releases === 0).map((c) => c.id);
    if (emptyIds.length) await prisma.storageLocation.deleteMany({ where: { id: { in: emptyIds } } });
    await prisma.furniture.delete({ where: { id } });
    return reply.status(204).send();
  });

  // ── Cell contents + assignment ────────────────────────────────────────────

  /** Find (or lazily create) the StorageLocation backing a furniture cell. */
  async function getOrCreateCell(furnitureId: string, cellX: number, cellY: number) {
    const f = await prisma.furniture.findUnique({ where: { id: furnitureId } });
    if (!f) throw notFound('Furniture not found');
    if (cellX < 0 || cellX >= f.columns || cellY < 0 || cellY >= f.rows)
      throw badRequest('Cell out of range');
    const existing = await prisma.storageLocation.findFirst({ where: { furnitureId, cellX, cellY } });
    if (existing) return existing;
    return prisma.storageLocation.create({
      data: {
        label: `${f.name} · C${cellX + 1}R${cellY + 1}`,
        furnitureId,
        cellX,
        cellY,
      },
    });
  }

  const cellParams = z.object({
    id: z.string(),
    x: z.coerce.number().int().min(0),
    y: z.coerce.number().int().min(0),
  });

  app.get('/furniture/:id/cells/:x/:y', async (req) => {
    const { id, x, y } = cellParams.parse(req.params);
    const cell = await prisma.storageLocation.findFirst({
      where: { furnitureId: id, cellX: x, cellY: y },
    });
    if (!cell) return { cell: null, releases: [] };
    const releases = await prisma.release.findMany({
      where: { storageLocationId: cell.id },
      orderBy: [{ artistDisplay: 'asc' }, { year: 'asc' }],
      select: {
        id: true,
        title: true,
        artistDisplay: true,
        year: true,
        coverPath: true,
        thumbUrl: true,
        storageSlot: true,
      },
    });
    return {
      cell: { id: cell.id, label: cell.label, note: cell.note },
      releases: releases.map((r) => ({
        id: r.id,
        title: r.title,
        artistDisplay: r.artistDisplay,
        year: r.year,
        coverUrl: coverUrlOf(r),
        storageSlot: r.storageSlot,
      })),
    };
  });

  app.post('/furniture/:id/cells/:x/:y/releases', async (req) => {
    const { id, x, y } = cellParams.parse(req.params);
    const { releaseId } = z.object({ releaseId: z.string() }).parse(req.body);
    const release = await prisma.release.findUnique({ where: { id: releaseId } });
    if (!release) throw notFound('Release not found');
    const cell = await getOrCreateCell(id, x, y);
    await prisma.release.update({
      where: { id: releaseId },
      data: { storageLocationId: cell.id },
    });
    return { ok: true, cellId: cell.id };
  });

  app.delete('/furniture/:id/cells/:x/:y/releases/:releaseId', async (req, reply) => {
    const { id, x, y } = cellParams.parse(req.params);
    const { releaseId } = z.object({ releaseId: z.string() }).parse(req.params);
    const cell = await prisma.storageLocation.findFirst({
      where: { furnitureId: id, cellX: x, cellY: y },
    });
    if (cell) {
      await prisma.release.updateMany({
        where: { id: releaseId, storageLocationId: cell.id },
        data: { storageLocationId: null },
      });
      // Drop the cell location once it is empty so the grid stays clean.
      const remaining = await prisma.release.count({ where: { storageLocationId: cell.id } });
      if (remaining === 0) await prisma.storageLocation.delete({ where: { id: cell.id } }).catch(() => {});
    }
    return reply.status(204).send();
  });
}
