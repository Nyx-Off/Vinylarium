import { FastifyInstance } from 'fastify';
import { prisma } from '../../db/prisma';
import { forbidden, conflict } from '../../lib/errors';
import {
  getCachedCheck,
  readLocalSha,
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
    const [currentSha, check] = await Promise.all([readLocalSha(), getCachedCheck()]);
    return { currentSha, check };
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
}
