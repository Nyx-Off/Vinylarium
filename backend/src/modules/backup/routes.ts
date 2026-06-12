import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
import { badRequest } from '../../lib/errors';
import { enrichQueue } from '../../lib/queue';
import { deriveDecade, sortName } from '../../lib/text';

/**
 * Collection backup as a single JSON file — NOT the same thing as the Discogs
 * CSV import. The export captures what identifies each record (Discogs id or
 * title/artist for manual ones) plus everything the USER owns and enrichment
 * would not bring back: rating, notes, tags, physical storage assignment,
 * manual lyrics and anecdotes. Restoring recreates missing releases (and
 * queues their Discogs enrichment), updates the user-owned fields on existing
 * ones, and never duplicates: releases match by discogsReleaseId (or
 * title+artist), tags by name, storage locations by label.
 */

const EXPORT_SCHEMA = 1;

const backupReleaseSchema = z.object({
  discogsReleaseId: z.number().int().positive().nullish(),
  title: z.string().min(1),
  artistDisplay: z.string().min(1).catch('Unknown Artist'),
  year: z.number().int().nullish(),
  releasedRaw: z.string().nullish(),
  country: z.string().nullish(),
  catalogNumber: z.string().nullish(),
  notes: z.string().nullish(),
  rating: z.number().int().min(0).max(5).nullish(),
  collectionFolder: z.string().nullish(),
  mediaCondition: z.string().nullish(),
  sleeveCondition: z.string().nullish(),
  collectionNotes: z.string().nullish(),
  dateAdded: z.coerce.date().nullish(),
  thumbUrl: z.string().nullish(),
  isStudio: z.boolean().optional(),
  isLive: z.boolean().optional(),
  isCompilation: z.boolean().optional(),
  isReissue: z.boolean().optional(),
  isRemaster: z.boolean().optional(),
  isSpecialEdition: z.boolean().optional(),
  storageLocationLabel: z.string().nullish(),
  storageSlot: z.string().nullish(),
  hidden: z.boolean().optional(),
  tags: z.array(z.string()).default([]),
  manualLyrics: z
    .array(
      z.object({
        trackTitle: z.string().nullish(),
        text: z.string().min(1),
        sourceUrl: z.string().nullish(),
      }),
    )
    .default([]),
  manualAnecdotes: z
    .array(
      z.object({
        title: z.string().nullish(),
        body: z.string().min(1),
        sourceUrl: z.string().nullish(),
      }),
    )
    .default([]),
});

const backupSchema = z.object({
  app: z.literal('vinylarium'),
  schema: z.number().int().min(1).max(EXPORT_SCHEMA),
  storageLocations: z
    .array(
      z.object({
        label: z.string().min(1),
        furniture: z.string().nullish(),
        shelf: z.string().nullish(),
        column: z.string().nullish(),
        row: z.string().nullish(),
        bin: z.string().nullish(),
        note: z.string().nullish(),
        sortOrder: z.number().int().optional(),
      }),
    )
    .default([]),
  tags: z.array(z.object({ name: z.string().min(1), color: z.string().nullish() })).default([]),
  releases: z.array(backupReleaseSchema),
});

export async function backupRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // Download the whole collection as a JSON backup.
  app.get('/export', async (_req, reply) => {
    const [releases, tags, storageLocations] = await Promise.all([
      prisma.release.findMany({
        orderBy: { createdAt: 'asc' },
        include: {
          storageLocation: true,
          tags: { include: { tag: true } },
          lyrics: { where: { source: 'MANUAL' }, include: { track: true } },
          anecdotes: { where: { source: { not: 'GENIUS' } } },
        },
      }),
      prisma.tag.findMany({ orderBy: { name: 'asc' } }),
      prisma.storageLocation.findMany({ orderBy: { sortOrder: 'asc' } }),
    ]);

    const payload = {
      app: 'vinylarium' as const,
      schema: EXPORT_SCHEMA,
      exportedAt: new Date().toISOString(),
      counts: { releases: releases.length, tags: tags.length, storageLocations: storageLocations.length },
      storageLocations: storageLocations.map((s) => ({
        label: s.label,
        furniture: s.furniture,
        shelf: s.shelf,
        column: s.column,
        row: s.row,
        bin: s.bin,
        note: s.note,
        sortOrder: s.sortOrder,
      })),
      tags: tags.map((t) => ({ name: t.name, color: t.color })),
      releases: releases.map((r) => ({
        discogsReleaseId: r.discogsReleaseId,
        title: r.title,
        artistDisplay: r.artistDisplay,
        year: r.year,
        releasedRaw: r.releasedRaw,
        country: r.country,
        catalogNumber: r.catalogNumber,
        notes: r.notes,
        rating: r.rating,
        collectionFolder: r.collectionFolder,
        mediaCondition: r.mediaCondition,
        sleeveCondition: r.sleeveCondition,
        collectionNotes: r.collectionNotes,
        dateAdded: r.dateAdded,
        thumbUrl: r.thumbUrl,
        isStudio: r.isStudio,
        isLive: r.isLive,
        isCompilation: r.isCompilation,
        isReissue: r.isReissue,
        isRemaster: r.isRemaster,
        isSpecialEdition: r.isSpecialEdition,
        storageLocationLabel: r.storageLocation?.label ?? null,
        storageSlot: r.storageSlot,
        hidden: r.hidden,
        tags: r.tags.map((t) => t.tag.name),
        manualLyrics: r.lyrics.map((l) => ({
          trackTitle: l.track?.title ?? null,
          text: l.text,
          sourceUrl: l.sourceUrl,
        })),
        manualAnecdotes: r.anecdotes.map((a) => ({
          title: a.title,
          body: a.body,
          sourceUrl: a.sourceUrl,
        })),
      })),
    };

    const stamp = new Date().toISOString().slice(0, 10);
    reply.header('Content-Disposition', `attachment; filename="vinylarium-sauvegarde-${stamp}.json"`);
    return payload;
  });

  // Restore a backup file: recreate missing releases (enrichment queued for
  // those with a Discogs id), refresh user-owned fields on existing ones.
  app.post('/import', async (req) => {
    const file = await req.file();
    if (!file) throw badRequest('Aucun fichier de sauvegarde envoyé');
    const buf = await file.toBuffer();

    let raw: unknown;
    try {
      raw = JSON.parse(buf.toString('utf8'));
    } catch {
      throw badRequest('Fichier illisible : ce n’est pas du JSON');
    }
    const parsed = backupSchema.safeParse(raw);
    if (!parsed.success) {
      throw badRequest(
        'Ce fichier n’est pas une sauvegarde Vinylarium (utilisez l’export de la page Paramètres)',
      );
    }
    const backup = parsed.data;

    // Storage locations by label, tags by name — never duplicated.
    const locByLabel = new Map<string, string>();
    for (const s of backup.storageLocations) {
      const existing = await prisma.storageLocation.findFirst({ where: { label: s.label } });
      const row =
        existing ??
        (await prisma.storageLocation.create({
          data: {
            label: s.label,
            furniture: s.furniture ?? undefined,
            shelf: s.shelf ?? undefined,
            column: s.column ?? undefined,
            row: s.row ?? undefined,
            bin: s.bin ?? undefined,
            note: s.note ?? undefined,
            sortOrder: s.sortOrder ?? 0,
          },
        }));
      locByLabel.set(s.label, row.id);
    }

    const tagByName = new Map<string, string>();
    async function tagId(name: string, color?: string | null) {
      const cached = tagByName.get(name);
      if (cached) return cached;
      const tag = await prisma.tag.upsert({
        where: { name },
        update: {},
        create: { name, color: color ?? undefined },
      });
      tagByName.set(name, tag.id);
      return tag.id;
    }
    for (const t of backup.tags) await tagId(t.name, t.color);

    let created = 0;
    let updated = 0;
    let enrichQueued = 0;

    for (const r of backup.releases) {
      const existing = r.discogsReleaseId
        ? await prisma.release.findUnique({ where: { discogsReleaseId: r.discogsReleaseId } })
        : await prisma.release.findFirst({
            where: { title: r.title, artistDisplay: r.artistDisplay, discogsReleaseId: null },
          });

      // Everything enrichment will NOT bring back.
      const userFields = {
        rating: r.rating ?? undefined,
        notes: r.notes ?? undefined,
        collectionFolder: r.collectionFolder ?? undefined,
        mediaCondition: r.mediaCondition ?? undefined,
        sleeveCondition: r.sleeveCondition ?? undefined,
        collectionNotes: r.collectionNotes ?? undefined,
        dateAdded: r.dateAdded ?? undefined,
        storageLocationId: r.storageLocationLabel
          ? locByLabel.get(r.storageLocationLabel)
          : undefined,
        storageSlot: r.storageSlot ?? undefined,
        hidden: r.hidden ?? undefined,
      };

      let release;
      if (existing) {
        release = await prisma.release.update({ where: { id: existing.id }, data: userFields });
        updated++;
      } else {
        release = await prisma.release.create({
          data: {
            source: r.discogsReleaseId ? 'DISCOGS' : 'MANUAL',
            enrichmentStatus: r.discogsReleaseId ? 'QUEUED' : 'MANUAL',
            discogsReleaseId: r.discogsReleaseId ?? undefined,
            title: r.title,
            sortTitle: sortName(r.title),
            artistDisplay: r.artistDisplay,
            year: r.year ?? undefined,
            decade: deriveDecade(r.year) ?? undefined,
            releasedRaw: r.releasedRaw ?? undefined,
            country: r.country ?? undefined,
            catalogNumber: r.catalogNumber ?? undefined,
            thumbUrl: r.thumbUrl ?? undefined,
            isStudio: r.isStudio ?? true,
            isLive: r.isLive ?? false,
            isCompilation: r.isCompilation ?? false,
            isReissue: r.isReissue ?? false,
            isRemaster: r.isRemaster ?? false,
            isSpecialEdition: r.isSpecialEdition ?? false,
            addedByUserId: req.user.sub,
            ...userFields,
          },
        });
        created++;
        if (r.discogsReleaseId) {
          await enrichQueue.add('enrich', { releaseId: release.id });
          enrichQueued++;
        }
      }

      for (const name of r.tags) {
        const tid = await tagId(name);
        await prisma.releaseTag.upsert({
          where: { releaseId_tagId: { releaseId: release.id, tagId: tid } },
          update: {},
          create: { releaseId: release.id, tagId: tid },
        });
      }

      for (const l of r.manualLyrics) {
        const dup = await prisma.lyrics.findFirst({
          where: { releaseId: release.id, source: 'MANUAL', text: l.text },
          select: { id: true },
        });
        if (dup) continue;
        // Tracks only exist once the release is enriched — best-effort link.
        const track = l.trackTitle
          ? await prisma.track.findFirst({
              where: { releaseId: release.id, title: l.trackTitle },
              select: { id: true },
            })
          : null;
        await prisma.lyrics.create({
          data: {
            releaseId: release.id,
            trackId: track?.id,
            text: l.text,
            source: 'MANUAL',
            sourceUrl: l.sourceUrl ?? undefined,
          },
        });
      }

      for (const a of r.manualAnecdotes) {
        const dup = await prisma.anecdote.findFirst({
          where: { releaseId: release.id, body: a.body },
          select: { id: true },
        });
        if (dup) continue;
        await prisma.anecdote.create({
          data: {
            releaseId: release.id,
            title: a.title ?? undefined,
            body: a.body,
            source: 'MANUAL',
            sourceUrl: a.sourceUrl ?? undefined,
            createdById: req.user.sub,
          },
        });
      }
    }

    return { total: backup.releases.length, created, updated, enrichQueued };
  });
}
