import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import path from 'path';
import { prisma } from '../../db/prisma';
import { badRequest, notFound } from '../../lib/errors';
import { currentUser } from '../../lib/auth-helpers';
import { saveBuffer } from '../../lib/storage';
import { deriveDecade, deriveVersionFlags, sortName } from '../../lib/text';
import {
  upsertArtistByName,
  upsertGenre,
  upsertLabelByName,
  upsertRole,
  upsertStyle,
  upsertTag,
} from '../../lib/upserts';
import { enrichQueue, lyricsQueue } from '../../lib/queue';
import { buildReleaseOrderBy, buildReleaseWhere, releaseQuerySchema } from './query';
import { releaseDetailInclude, toDetail, toListItem } from './serialize';

const manualReleaseSchema = z.object({
  title: z.string().trim().min(1).max(500),
  artist: z.string().trim().min(1).max(500),
  year: z.number().int().min(1000).max(2200).nullish(),
  country: z.string().trim().max(120).nullish(),
  catalogNumber: z.string().trim().max(120).nullish(),
  notes: z.string().max(20000).nullish(),
  rating: z.number().int().min(0).max(5).nullish(),
  labels: z.array(z.string().trim().min(1)).default([]),
  genres: z.array(z.string().trim().min(1)).default([]),
  styles: z.array(z.string().trim().min(1)).default([]),
  formatDescriptions: z.array(z.string().trim().min(1)).default([]),
  tracklist: z
    .array(
      z.object({
        position: z.string().max(20).nullish(),
        title: z.string().trim().min(1),
        duration: z.string().max(20).nullish(),
      }),
    )
    .default([]),
  credits: z
    .array(z.object({ artist: z.string().trim().min(1), role: z.string().trim().min(1) }))
    .default([]),
  tags: z.array(z.string().trim().min(1)).default([]),
  storageLocationId: z.string().nullish(),
  storageSlot: z.string().max(60).nullish(),
  flags: z
    .object({
      isLive: z.boolean().optional(),
      isCompilation: z.boolean().optional(),
      isReissue: z.boolean().optional(),
      isRemaster: z.boolean().optional(),
      isSpecialEdition: z.boolean().optional(),
    })
    .default({}),
});

const patchReleaseSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  artistDisplay: z.string().trim().min(1).max(500).optional(),
  year: z.number().int().min(1000).max(2200).nullish(),
  country: z.string().trim().max(120).nullish(),
  catalogNumber: z.string().trim().max(120).nullish(),
  notes: z.string().max(20000).nullish(),
  rating: z.number().int().min(0).max(5).nullish(),
  mediaCondition: z.string().max(60).nullish(),
  sleeveCondition: z.string().max(60).nullish(),
  storageLocationId: z.string().nullish(),
  storageSlot: z.string().max(60).nullish(),
  tags: z.array(z.string().trim().min(1)).optional(),
  flags: z
    .object({
      isStudio: z.boolean().optional(),
      isLive: z.boolean().optional(),
      isCompilation: z.boolean().optional(),
      isReissue: z.boolean().optional(),
      isRemaster: z.boolean().optional(),
      isSpecialEdition: z.boolean().optional(),
    })
    .optional(),
});

export async function releaseRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // ── List / filter ────────────────────────────────────────────────────────
  app.get('/', async (req) => {
    const qp = releaseQuerySchema.parse(req.query);
    const where = buildReleaseWhere(qp);
    const orderBy = buildReleaseOrderBy(qp.sort);
    const [total, items] = await Promise.all([
      prisma.release.count({ where }),
      prisma.release.findMany({
        where,
        orderBy,
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

  // ── Bulk re-enrichment (whole collection) ─────────────────────────────────
  app.get('/reenrich-status', async () => {
    const counts = await enrichQueue.getJobCounts('waiting', 'active', 'delayed');
    const waiting = (counts.waiting ?? 0) + (counts.delayed ?? 0);
    const active = counts.active ?? 0;
    const pending = await prisma.release.count({
      where: { enrichmentStatus: { in: ['QUEUED', 'ENRICHING'] } },
    });
    return { inProgress: waiting + active > 0, waiting, active, pending };
  });

  app.post('/reenrich-all', async () => {
    const releases = await prisma.release.findMany({
      where: { discogsReleaseId: { not: null } },
      select: { id: true },
    });
    await prisma.release.updateMany({
      where: { discogsReleaseId: { not: null } },
      data: { enrichmentStatus: 'QUEUED', enrichmentError: null },
    });
    await enrichQueue.addBulk(releases.map((r) => ({ name: 'enrich', data: { releaseId: r.id } })));
    return { queued: releases.length };
  });

  app.post('/reenrich-all/stop', async () => {
    // Remove queued + delayed jobs; the job currently processing will finish.
    await enrichQueue.drain(true);
    return { stopped: true };
  });

  // ── Random pick ───────────────────────────────────────────────────────────
  app.get('/random', async () => {
    const count = await prisma.release.count();
    if (count === 0) throw notFound('Collection vide');
    const skip = Math.floor(Math.random() * count);
    const r = await prisma.release.findFirst({ skip });
    if (!r) throw notFound('Collection vide');
    return toListItem(r);
  });

  // ── Detail ────────────────────────────────────────────────────────────────
  app.get('/:id', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const release = await prisma.release.findUnique({
      where: { id },
      include: releaseDetailInclude as any,
    });
    if (!release) throw notFound('Release not found');
    return toDetail(release);
  });

  // ── Manual add ──────────────────────────────────────────────────────────
  app.post('/', async (req) => {
    const body = manualReleaseSchema.parse(req.body);
    const me = await currentUser(req);

    const derived = deriveVersionFlags(body.formatDescriptions);
    const flags = { ...derived, ...body.flags };
    flags.isStudio = body.flags.isLive === true ? false : flags.isLive ? false : true;

    const release = await prisma.release.create({
      data: {
        source: 'MANUAL',
        enrichmentStatus: 'MANUAL',
        title: body.title,
        sortTitle: sortName(body.title),
        artistDisplay: body.artist,
        year: body.year ?? null,
        decade: deriveDecade(body.year),
        country: body.country ?? null,
        catalogNumber: body.catalogNumber ?? null,
        notes: body.notes ?? null,
        rating: body.rating ?? null,
        storageLocationId: body.storageLocationId ?? null,
        storageSlot: body.storageSlot ?? null,
        addedByUserId: me.id,
        isStudio: flags.isStudio,
        isLive: flags.isLive ?? false,
        isCompilation: flags.isCompilation ?? false,
        isReissue: flags.isReissue ?? false,
        isRemaster: flags.isRemaster ?? false,
        isSpecialEdition: flags.isSpecialEdition ?? false,
      },
    });

    // Primary artist
    const primary = await upsertArtistByName(body.artist);
    await prisma.releaseArtist.create({
      data: { releaseId: release.id, artistId: primary.id, position: 0 },
    });

    // Labels / genres / styles / tags
    for (const name of body.labels) {
      const label = await upsertLabelByName(name);
      await prisma.releaseLabel.create({
        data: { releaseId: release.id, labelId: label.id, catno: body.catalogNumber ?? '' },
      });
    }
    for (const name of body.genres) {
      const g = await upsertGenre(name);
      await prisma.releaseGenre.create({ data: { releaseId: release.id, genreId: g.id } });
    }
    for (const name of body.styles) {
      const s = await upsertStyle(name);
      await prisma.releaseStyle.create({ data: { releaseId: release.id, styleId: s.id } });
    }
    for (const name of body.tags) {
      const t = await upsertTag(name);
      await prisma.releaseTag.create({ data: { releaseId: release.id, tagId: t.id } });
    }

    if (body.formatDescriptions.length) {
      await prisma.releaseFormat.create({
        data: { releaseId: release.id, name: 'Vinyl', descriptions: body.formatDescriptions },
      });
    }

    // Tracklist
    let idx = 0;
    for (const t of body.tracklist) {
      await prisma.track.create({
        data: {
          releaseId: release.id,
          position: t.position ?? null,
          title: t.title,
          duration: t.duration ?? null,
          trackIndex: idx++,
        },
      });
    }

    // Credits (musicians / singers / authors / producers)
    let cpos = 0;
    for (const c of body.credits) {
      const artist = await upsertArtistByName(c.artist);
      const role = await upsertRole(c.role);
      await prisma.credit.create({
        data: {
          releaseId: release.id,
          artistId: artist.id,
          roleId: role.id,
          rawRole: c.role,
          position: cpos++,
        },
      });
    }

    const full = await prisma.release.findUnique({
      where: { id: release.id },
      include: releaseDetailInclude as any,
    });
    return toDetail(full);
  });

  // ── Update ────────────────────────────────────────────────────────────────
  app.patch('/:id', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = patchReleaseSchema.parse(req.body);
    const existing = await prisma.release.findUnique({ where: { id } });
    if (!existing) throw notFound('Release not found');

    const data: Record<string, unknown> = {};
    if (body.title !== undefined) {
      data.title = body.title;
      data.sortTitle = sortName(body.title);
    }
    if (body.artistDisplay !== undefined) data.artistDisplay = body.artistDisplay;
    if (body.year !== undefined) {
      data.year = body.year;
      data.decade = deriveDecade(body.year);
    }
    for (const k of ['country', 'catalogNumber', 'notes', 'rating', 'mediaCondition', 'sleeveCondition', 'storageLocationId', 'storageSlot'] as const) {
      if (body[k] !== undefined) data[k] = body[k];
    }
    if (body.flags) Object.assign(data, body.flags);

    await prisma.release.update({ where: { id }, data });

    if (body.tags) {
      await prisma.releaseTag.deleteMany({ where: { releaseId: id } });
      for (const name of body.tags) {
        const t = await upsertTag(name);
        await prisma.releaseTag.create({ data: { releaseId: id, tagId: t.id } });
      }
    }

    const full = await prisma.release.findUnique({
      where: { id },
      include: releaseDetailInclude as any,
    });
    return toDetail(full);
  });

  // ── Delete ────────────────────────────────────────────────────────────────
  app.delete('/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    await prisma.release.delete({ where: { id } }).catch(() => {
      throw notFound('Release not found');
    });
    return reply.status(204).send();
  });

  // ── Cover upload ──────────────────────────────────────────────────────────
  app.post('/:id/cover', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const release = await prisma.release.findUnique({ where: { id } });
    if (!release) throw notFound('Release not found');
    const file = await req.file();
    if (!file) throw badRequest('No file uploaded');
    const ext = path.extname(file.filename || '.jpg') || '.jpg';
    const buf = await file.toBuffer();
    const which = (file.fieldname === 'back' ? 'back' : 'front');
    const rel = await saveBuffer('covers', `manual-${id}-${which}${ext}`, buf);
    await prisma.release.update({
      where: { id },
      data: which === 'back' ? { backCoverPath: rel } : { coverPath: rel },
    });
    return { ok: true };
  });

  // ── Anecdotes & lyrics ──────────────────────────────────────────────────
  app.post('/:id/anecdotes', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z
      .object({ title: z.string().max(200).nullish(), body: z.string().min(1), sourceUrl: z.string().url().nullish() })
      .parse(req.body);
    const me = await currentUser(req);
    const anecdote = await prisma.anecdote.create({
      data: {
        releaseId: id,
        title: body.title ?? null,
        body: body.body,
        source: 'MANUAL',
        sourceUrl: body.sourceUrl ?? null,
        createdById: me.id,
      },
    });
    return anecdote;
  });

  app.post('/:id/lyrics', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z
      .object({ trackId: z.string().nullish(), text: z.string().min(1), sourceUrl: z.string().url().nullish() })
      .parse(req.body);
    const lyrics = await prisma.lyrics.create({
      data: {
        releaseId: id,
        trackId: body.trackId ?? null,
        text: body.text,
        source: 'MANUAL',
        sourceUrl: body.sourceUrl ?? null,
      },
    });
    return lyrics;
  });

  // ── Fetch lyrics from Genius on demand ────────────────────────────────
  app.post('/:id/lyrics/fetch', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const release = await prisma.release.findUnique({ where: { id } });
    if (!release) throw notFound('Release not found');
    await lyricsQueue.add('lyrics', { releaseId: id });
    return { ok: true };
  });

  // ── Re-run enrichment ──────────────────────────────────────────────────
  app.post('/:id/reenrich', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const release = await prisma.release.findUnique({ where: { id } });
    if (!release) throw notFound('Release not found');
    if (!release.discogsReleaseId) throw badRequest('Release has no Discogs id to enrich from');
    await prisma.release.update({ where: { id }, data: { enrichmentStatus: 'QUEUED', enrichmentError: null } });
    await enrichQueue.add('enrich', { releaseId: id });
    return { ok: true };
  });
}
