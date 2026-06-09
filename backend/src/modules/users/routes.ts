import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import path from 'path';
import { prisma } from '../../db/prisma';
import { hashPassword } from '../../lib/password';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { assertSelfOrAdmin } from '../../lib/auth-helpers';
import { saveBuffer } from '../../lib/storage';
import { publicUser } from './serialize';

export async function userRoutes(app: FastifyInstance) {
  // Public: the profile tiles on the home screen (rendered before login).
  app.get('/', async () => {
    const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    return { users: users.map(publicUser) };
  });

  app.get('/:id', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw notFound('Profile not found');
    return { user: publicUser(user) };
  });

  // Update profile (self or admin).
  app.patch('/:id', { preHandler: app.authenticate }, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    await assertSelfOrAdmin(req, id);
    const body = z
      .object({
        displayName: z.string().trim().min(1).max(60).optional(),
        // password: a string sets it, null removes it.
        password: z.string().min(1).max(200).nullable().optional(),
        preferences: z.record(z.any()).optional(),
      })
      .parse(req.body);

    const data: Record<string, unknown> = {};
    if (body.displayName !== undefined) data.displayName = body.displayName;
    if (body.password !== undefined) {
      data.passwordHash = body.password === null ? null : await hashPassword(body.password);
    }
    if (body.preferences !== undefined) data.preferences = body.preferences;

    const user = await prisma.user.update({ where: { id }, data });
    return { user: { ...publicUser(user), preferences: user.preferences } };
  });

  // Avatar upload (self or admin).
  app.post('/:id/avatar', { preHandler: app.authenticate }, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    await assertSelfOrAdmin(req, id);
    const file = await req.file();
    if (!file) throw badRequest('No file uploaded');
    const ext = path.extname(file.filename || '.png') || '.png';
    const buf = await file.toBuffer();
    const rel = await saveBuffer('avatars', `${id}${ext}`, buf);
    const user = await prisma.user.update({ where: { id }, data: { avatarPath: rel } });
    return { user: publicUser(user) };
  });

  // Delete a profile (self or admin); never delete the last account.
  app.delete('/:id', { preHandler: app.authenticate }, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    await assertSelfOrAdmin(req, id);
    const count = await prisma.user.count();
    if (count <= 1) throw forbidden('Cannot delete the last profile');
    await prisma.user.delete({ where: { id } }).catch(() => {
      throw notFound('Profile not found');
    });
    return reply.status(204).send();
  });
}
