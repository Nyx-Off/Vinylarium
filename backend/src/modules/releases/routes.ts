import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import path from 'path';
import { prisma } from '../../db/prisma';
import { badRequest, notFound } from '../../lib/errors';
import { currentUser } from '../../lib/auth-helpers';
import { saveBuffer, mediaUrl } from '../../lib/storage';
import { deriveDecade, deriveVersionFlags, sortName } from '../../lib/text';
import {
  upsertArtistByName,
  upsertGenre,
  upsertLabelByName,
  upsertRole,
  upsertStyle,
  upsertTag,
} from '../../lib/upserts';
import { artistOriginJobId, enrichQueue, lyricsQueue, musicbrainzQueue } from '../../lib/queue';
import { discogs } from '../../worker/clients/discogs';
import { buildReleaseOrderBy, buildReleaseWhere, releaseQuerySchema } from './query';
import { releaseDetailInclude, toDetail, toListItem } from './serialize';

// Migration that introduced the original-vs-pressing year split. Discs enriched
// BEFORE it ran ON THIS INSTANCE still carry the pressing year in Release.year
// and need a (light) years recompute. Reading its applied time per-instance is
// correct regardless of when each deployment updated.
const PRESSING_YEAR_MIGRATION = '20260612090000_hidden_years_profile_keys';
async function pressingYearCutoff(): Promise<Date | null> {
  try {
    const rows = await prisma.$queryRaw<{ finished_at: Date | null }[]>`
      SELECT finished_at FROM _prisma_migrations
      WHERE migration_name = ${PRESSING_YEAR_MIGRATION} LIMIT 1`;
    return rows[0]?.finished_at ?? null;
  } catch {
    return null;
  }
}

// Spacing gate for the live Discogs search: at most one outbound call per
// 1.1s across all users, so typing can't eat the worker's rate budget.
let nextDiscogsSearchAt = 0;
async function discogsSearchGate() {
  const now = Date.now();
  const wait = Math.max(0, nextDiscogsSearchAt - now);
  nextDiscogsSearchAt = Math.max(now, nextDiscogsSearchAt) + 1100;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

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
  hidden: z.boolean().optional(),
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

  // ── Bulk re-enrichment (whole collection / missing only) ──────────────────
  // "Missing" definitions shared by the status counters and the queueing
  // endpoint. Discogs: never successfully enriched (or failed) — releases
  // already sitting in the queue are not re-added. Genius: enriched releases
  // whose lyrics+anecdote pass never completed (quota outages leave them
  // dated-null, so a later run picks up exactly where it stopped).
  const missingDiscogsWhere = {
    discogsReleaseId: { not: null },
    enrichmentStatus: { notIn: ['QUEUED', 'ENRICHING'] as any },
    OR: [{ enrichedAt: null }, { enrichmentStatus: 'FAILED' as any }],
  };
  const missingGeniusWhere = { enrichmentStatus: 'ENRICHED' as any, lyricsFetchedAt: null };

  app.get('/reenrich-status', async () => {
    const cutoff = await pressingYearCutoff();
    const [counts, lyricsCounts, pending, missingDiscogs, missingGenius, staleYears] =
      await Promise.all([
        enrichQueue.getJobCounts('waiting', 'active', 'delayed'),
        lyricsQueue.getJobCounts('waiting', 'active', 'delayed'),
        prisma.release.count({ where: { enrichmentStatus: { in: ['QUEUED', 'ENRICHING'] } } }),
        prisma.release.count({ where: missingDiscogsWhere }),
        prisma.release.count({ where: missingGeniusWhere }),
        cutoff
          ? prisma.release.count({
              where: { enrichmentStatus: 'ENRICHED' as any, enrichedAt: { lt: cutoff } },
            })
          : Promise.resolve(0),
      ]);
    const waiting = (counts.waiting ?? 0) + (counts.delayed ?? 0);
    const active = counts.active ?? 0;
    const lyricsWaiting = (lyricsCounts.waiting ?? 0) + (lyricsCounts.delayed ?? 0);
    const lyricsActive = lyricsCounts.active ?? 0;
    return {
      inProgress: waiting + active > 0,
      waiting,
      active,
      pending,
      missingDiscogs,
      missingGenius,
      staleYears,
      lyrics: {
        inProgress: lyricsWaiting + lyricsActive > 0,
        waiting: lyricsWaiting,
        active: lyricsActive,
      },
    };
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

  // Re-enrich ONLY what's missing. Quota exhaustion is survivable by design:
  // the enrich queue retries 429s with backoff, and the lyrics worker pauses
  // itself 15 min at a time on a Genius 429 then resumes where it stopped.
  app.post('/reenrich-missing', async (req) => {
    const { what } = z.object({ what: z.enum(['discogs', 'genius']) }).parse(req.body);
    if (what === 'discogs') {
      const releases = await prisma.release.findMany({
        where: missingDiscogsWhere,
        select: { id: true },
      });
      await prisma.release.updateMany({
        where: missingDiscogsWhere,
        data: { enrichmentStatus: 'QUEUED', enrichmentError: null },
      });
      await enrichQueue.addBulk(
        releases.map((r) => ({ name: 'enrich', data: { releaseId: r.id } })),
      );
      return { queued: releases.length };
    }
    const releases = await prisma.release.findMany({
      where: missingGeniusWhere,
      select: { id: true },
    });
    await lyricsQueue.addBulk(releases.map((r) => ({ name: 'lyrics', data: { releaseId: r.id } })));
    return { queued: releases.length };
  });

  app.post('/reenrich-all/stop', async (req) => {
    // Remove queued + delayed jobs; the job currently processing will finish.
    const { queue } = z
      .object({ queue: z.enum(['enrich', 'lyrics']).default('enrich') })
      .parse((req.body as object) ?? {});
    await (queue === 'lyrics' ? lyricsQueue : enrichQueue).drain(true);
    return { stopped: true };
  });

  // Recompute the original (master) vs pressing year on discs enriched BEFORE
  // the split — Release.year still holds the pressing year there. Light: only
  // re-fetches the master (cached/shared across pressings, no images, no
  // relation rebuild) via 'fix-years' jobs on the enrich queue. Scoped by the
  // per-instance migration date so it never touches already-split discs, and
  // idempotent (each pass bumps enrichedAt past the cutoff).
  app.post('/recompute-years', async () => {
    const cutoff = await pressingYearCutoff();
    if (!cutoff) return { queued: 0 };
    const releases = await prisma.release.findMany({
      where: { enrichmentStatus: 'ENRICHED' as any, enrichedAt: { lt: cutoff } },
      select: { id: true },
    });
    await enrichQueue.addBulk(
      releases.map((r) => ({ name: 'fix-years', data: { releaseId: r.id } })),
    );
    return { queued: releases.length };
  });

  // ── Random pick ───────────────────────────────────────────────────────────
  app.get('/random', async () => {
    const where = { hidden: false } as const;
    const count = await prisma.release.count({ where });
    if (count === 0) throw notFound('Collection vide');
    const skip = Math.floor(Math.random() * count);
    const r = await prisma.release.findFirst({ where, skip });
    if (!r) throw notFound('Collection vide');
    return toListItem(r);
  });

  // ── Duplicate detection ───────────────────────────────────────────────────
  // Groups releases that are likely the same work: sharing a Discogs master id
  // (different pressings of one album) OR, lacking that, the same normalized
  // artist + title (manual adds, non-Discogs entries). Returns groups of size
  // ≥ 2 so the user can review and hide/merge them.
  app.get('/duplicates', async () => {
    const releases = await prisma.release.findMany({
      select: {
        id: true,
        title: true,
        artistDisplay: true,
        year: true,
        pressingYear: true,
        country: true,
        catalogNumber: true,
        coverPath: true,
        thumbUrl: true,
        hidden: true,
        discogsMasterId: true,
      },
    });

    const norm = (s: string) =>
      s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/\(\d+\)/g, '') // Discogs "(2)" disambiguation suffixes
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

    const groups = new Map<string, { key: string; items: typeof releases }>();
    for (const r of releases) {
      // A master id is the strongest "same album" signal; fall back to the
      // normalized artist+title so manual/non-Discogs discs still cluster.
      const key =
        r.discogsMasterId != null
          ? `m:${r.discogsMasterId}`
          : `t:${norm(r.artistDisplay)}|${norm(r.title)}`;
      const g = groups.get(key);
      if (g) g.items.push(r);
      else groups.set(key, { key, items: [r] });
    }

    const dupes = [...groups.values()]
      .filter((g) => g.items.length > 1)
      .map((g) => ({
        key: g.key,
        kind: g.key.startsWith('m:') ? ('master' as const) : ('title' as const),
        count: g.items.length,
        releases: g.items
          .map((r) => ({
            id: r.id,
            title: r.title,
            artistDisplay: r.artistDisplay,
            year: r.year,
            pressingYear: r.pressingYear,
            country: r.country,
            catalogNumber: r.catalogNumber,
            coverUrl: mediaUrl(r.coverPath) ?? r.thumbUrl,
            hidden: r.hidden,
          }))
          .sort((a, b) => (a.pressingYear ?? a.year ?? 0) - (b.pressingYear ?? b.year ?? 0)),
      }))
      .sort((a, b) => b.count - a.count || a.releases[0].artistDisplay.localeCompare(b.releases[0].artistDisplay));

    return { groups: dupes, total: dupes.reduce((n, g) => n + g.count, 0) };
  });

  // ── Live Discogs search (the "add a disc" page) ───────────────────────────
  // Exception to the "Discogs only from the worker" rule: searches are
  // user-driven, debounced client-side AND spaced ≥1.1s here, so they sip a
  // few requests/min from the shared 55/min budget; enrichment retries absorb
  // an occasional 429.
  app.get('/discogs-search', async (req) => {
    const { q, mode } = z
      .object({
        q: z.string().trim().min(2).max(200),
        mode: z.enum(['all', 'barcode', 'catno', 'artist']).default('all'),
      })
      .parse(req.query);
    if (!discogs.hasAuth()) {
      throw badRequest(
        'Recherche Discogs indisponible : configurez DISCOGS_TOKEN (ou key/secret) côté serveur',
      );
    }
    await discogsSearchGate();
    const params =
      mode === 'barcode'
        ? { barcode: q.replace(/[\s-]/g, '') }
        : mode === 'catno'
          ? { catno: q }
          : mode === 'artist'
            ? { artist: q }
            : { q };
    const results = await discogs.searchReleases(params);
    // Flag what's already in the library so the UI can say so.
    const ids = results.map((r) => r.id);
    const existing = await prisma.release.findMany({
      where: { discogsReleaseId: { in: ids } },
      select: { id: true, discogsReleaseId: true },
    });
    const byDiscogsId = new Map(existing.map((e) => [e.discogsReleaseId, e.id]));
    return {
      results: results.map((r) => ({ ...r, existingId: byDiscogsId.get(r.id) ?? null })),
    };
  });

  // ── Add straight from a Discogs search pick ───────────────────────────────
  app.post('/from-discogs', async (req) => {
    const body = z
      .object({
        discogsId: z.number().int().positive(),
        title: z.string().trim().min(1).max(500), // "Artist - Title" from search
        year: z.string().trim().max(10).nullish(),
        country: z.string().trim().max(120).nullish(),
        catalogNumber: z.string().trim().max(120).nullish(),
        thumb: z.string().url().max(1000).nullish(),
        storageLocationId: z.string().nullish(),
        storageSlot: z.string().max(60).nullish(),
      })
      .parse(req.body);
    const me = await currentUser(req);

    const existing = await prisma.release.findUnique({
      where: { discogsReleaseId: body.discogsId },
      select: { id: true },
    });
    if (existing) return { id: existing.id, existing: true };

    // Discogs search titles are "Artist - Title"; enrichment will rewrite
    // both fields properly from the full release right after.
    const sep = body.title.indexOf(' - ');
    const artist = sep > 0 ? body.title.slice(0, sep).trim() : 'Unknown Artist';
    const title = sep > 0 ? body.title.slice(sep + 3).trim() : body.title;
    const year = body.year ? parseInt(body.year, 10) : NaN;

    const release = await prisma.release.create({
      data: {
        source: 'DISCOGS',
        enrichmentStatus: 'QUEUED',
        discogsReleaseId: body.discogsId,
        title,
        sortTitle: sortName(title),
        artistDisplay: artist,
        year: Number.isFinite(year) ? year : undefined,
        decade: deriveDecade(Number.isFinite(year) ? year : null) ?? undefined,
        country: body.country ?? undefined,
        catalogNumber: body.catalogNumber ?? undefined,
        thumbUrl: body.thumb ?? undefined,
        storageLocationId: body.storageLocationId || undefined,
        storageSlot: body.storageSlot ?? undefined,
        dateAdded: new Date(),
        addedByUserId: me.id,
      },
    });
    await enrichQueue.add('enrich', { releaseId: release.id });
    return { id: release.id, existing: false };
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
    if (primary.originStatus === 'PENDING') {
      await musicbrainzQueue
        .add('origin', { artistId: primary.id }, { jobId: artistOriginJobId(primary.id) })
        .catch(() => undefined);
    }

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
    for (const k of ['country', 'catalogNumber', 'notes', 'rating', 'mediaCondition', 'sleeveCondition', 'storageLocationId', 'storageSlot', 'hidden'] as const) {
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
