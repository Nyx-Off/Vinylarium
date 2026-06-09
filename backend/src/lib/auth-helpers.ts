import { FastifyRequest } from 'fastify';
import { prisma } from '../db/prisma';
import { forbidden, unauthorized } from './errors';

export async function currentUser(req: FastifyRequest) {
  const u = await prisma.user.findUnique({ where: { id: req.user.sub } });
  if (!u) throw unauthorized();
  return u;
}

export async function assertSelfOrAdmin(req: FastifyRequest, targetId: string) {
  const u = await currentUser(req);
  if (u.id !== targetId && !u.isAdmin) throw forbidden();
  return u;
}
