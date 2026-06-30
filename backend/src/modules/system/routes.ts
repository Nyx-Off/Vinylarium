import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
import { forbidden, conflict } from '../../lib/errors';
import { envConfigured, readApiKeyOverrides, saveApiKeyOverrides } from '../../lib/api-keys';
import {
  getCachedCheck,
  readLocalSha,
  readLocalVersion,
  readUpdateStatus,
  requestUpdate,
  runUpdateCheck,
} from '../../lib/update';
import { disableShare, enableShare, getShare } from '../../lib/public-share';
import { promises as fs } from 'fs';
import path from 'path';
import { config } from '../../config';
import { SUBDIRS } from '../../lib/storage';
import { enrichQueue, importQueue, lyricsQueue, musicbrainzQueue } from '../../lib/queue';

export async function systemRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  async function requireAdmin(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.isAdmin) throw forbidden('Réservé aux administrateurs');
  }

  // Current version + last (cached) update check — cheap, no network.
  app.get('/version', async () => {
    const [currentSha, currentVersion, check] = await Promise.all([
      readLocalSha(),
      readLocalVersion(),
      getCachedCheck(),
    ]);
    return { currentSha, currentVersion, check };
  });

  // Force a check against GitHub right now.
  app.post('/check', async () => {
    const check = await runUpdateCheck();
    return { check };
  });

  // Ask the updater sidecar to pull + rebuild + restart. Admin only.
  app.post('/update', async (req) => {
    await requireAdmin(req.user.sub);
    const status = await readUpdateStatus();
    if (status.state === 'requested' || status.state === 'running') {
      throw conflict('Une mise à jour est déjà en cours');
    }
    await requestUpdate(req.user.sub);
    return { started: true };
  });

  // Progress of the running (or last) update, polled by the UI.
  app.get('/update-status', async () => readUpdateStatus());

  // ── Server API keys (enrichment) — editable from the UI, admin only ──────
  // Stored in the Setting table, layered over .env (empty field = keep .env).
  app.get('/api-keys', async (req) => {
    await requireAdmin(req.user.sub);
    const overrides = await readApiKeyOverrides();
    return {
      discogsToken: overrides.discogsToken ?? '',
      geniusAccessToken: overrides.geniusAccessToken ?? '',
      spotifyClientId: overrides.spotifyClientId ?? '',
      spotifyClientSecret: overrides.spotifyClientSecret ?? '',
      envConfigured: envConfigured(),
    };
  });

  app.put('/api-keys', async (req) => {
    await requireAdmin(req.user.sub);
    const body = z
      .object({
        discogsToken: z.string().trim().max(200).optional(),
        geniusAccessToken: z.string().trim().max(300).optional(),
        spotifyClientId: z.string().trim().max(200).optional(),
        spotifyClientSecret: z.string().trim().max(200).optional(),
      })
      .parse(req.body);
    await saveApiKeyOverrides({
      discogsToken: body.discogsToken || undefined,
      geniusAccessToken: body.geniusAccessToken || undefined,
      spotifyClientId: body.spotifyClientId || undefined,
      spotifyClientSecret: body.spotifyClientSecret || undefined,
    });
    // The API uses the new keys immediately; the worker re-reads them within
    // a minute (its Discogs rate limiter stays at the boot value until the
    // next worker restart — conservative, so always safe).
    return { ok: true };
  });

  // ── Public read-only share link (admin only) ─────────────────────────────
  app.get('/share', async (req) => {
    await requireAdmin(req.user.sub);
    return getShare();
  });

  // Generate (or rotate) the token and enable sharing.
  app.post('/share', async (req) => {
    await requireAdmin(req.user.sub);
    return enableShare();
  });

  app.delete('/share', async (req) => {
    await requireAdmin(req.user.sub);
    await disableShare();
    return { enabled: false, token: null };
  });

  // ── Reset the Vinylarium collection (admin only, destructive) ─────────────
  // Removes EVERY release and the collection-scoped entities (artists, labels,
  // genres, styles, tags, band members, import history) plus the downloaded
  // cover files. KEEPS: the 3D storage room + furniture (and its now-empty
  // cells), users/profiles, server settings and API keys. Does NOT touch the
  // user's Discogs account. Requires an explicit `confirm: "RESET"` body.
  app.post('/reset-collection', async (req) => {
    await requireAdmin(req.user.sub);
    const body = z.object({ confirm: z.string() }).parse(req.body);
    if (body.confirm !== 'RESET') throw conflict('Confirmation manquante');

    // Drain pending jobs first so nothing re-creates rows mid-reset.
    await Promise.all(
      [importQueue, enrichQueue, lyricsQueue, musicbrainzQueue].map((q) =>
        q.obliterate({ force: true }).catch(() => undefined),
      ),
    );

    const deletedReleases = await prisma.release.count();
    // Order matters: releases first (cascades all their children incl. credits,
    // tracks, images, lyrics, tags links, format rows). Band members reference
    // artists, so clear them before artists. Storage locations/furniture are
    // left untouched (release.storageLocationId is ON DELETE SET NULL).
    await prisma.$transaction([
      prisma.release.deleteMany({}),
      prisma.bandMember.deleteMany({}),
      prisma.artist.deleteMany({}),
      prisma.label.deleteMany({}),
      prisma.genre.deleteMany({}),
      prisma.style.deleteMany({}),
      prisma.tag.deleteMany({}),
      prisma.importJob.deleteMany({}),
    ]);

    // Best-effort: drop the downloaded cover files (all belonged to deleted
    // releases). Avatars and the room stay.
    try {
      const dir = path.join(config.storageDir, SUBDIRS.covers);
      const entries = await fs.readdir(dir).catch(() => [] as string[]);
      await Promise.all(entries.map((f) => fs.rm(path.join(dir, f), { force: true })));
    } catch {
      /* ignore filesystem cleanup errors */
    }

    return { ok: true, deletedReleases };
  });
}
