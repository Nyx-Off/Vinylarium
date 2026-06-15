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
      envConfigured: envConfigured(),
    };
  });

  app.put('/api-keys', async (req) => {
    await requireAdmin(req.user.sub);
    const body = z
      .object({
        discogsToken: z.string().trim().max(200).optional(),
        geniusAccessToken: z.string().trim().max(300).optional(),
      })
      .parse(req.body);
    await saveApiKeyOverrides({
      discogsToken: body.discogsToken || undefined,
      geniusAccessToken: body.geniusAccessToken || undefined,
    });
    // The API uses the new keys immediately; the worker re-reads them within
    // a minute (its Discogs rate limiter stays at the boot value until the
    // next worker restart — conservative, so always safe).
    return { ok: true };
  });
}
