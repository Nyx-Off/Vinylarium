import Fastify, { FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { ZodError } from 'zod';

import { config } from './config';
import { HttpError } from './lib/errors';

import { authRoutes } from './modules/auth/routes';
import { userRoutes } from './modules/users/routes';
import { releaseRoutes } from './modules/releases/routes';
import { artistRoutes } from './modules/artists/routes';
import { importRoutes } from './modules/import/routes';
import { searchRoutes } from './modules/search/routes';
import { storageRoutes } from './modules/storage/routes';
import { statsRoutes } from './modules/stats/routes';

export async function buildApp() {
  const app = Fastify({
    logger: { level: config.isProd ? 'info' : 'debug' },
    bodyLimit: 8 * 1024 * 1024,
    trustProxy: true,
  });

  await app.register(cors, { origin: true });
  await app.register(jwt, {
    secret: config.jwt.secret,
    sign: { expiresIn: config.jwt.expiresIn },
  });
  await app.register(multipart, {
    limits: { fileSize: 64 * 1024 * 1024, files: 1 },
  });
  await app.register(fastifyStatic, {
    root: config.storageDir,
    prefix: '/media/',
    decorateReply: false,
  });

  // Auth guard available to every route plugin (decorators inherit downward).
  app.decorate(
    'authenticate',
    async function (req: FastifyRequest, _reply: FastifyReply) {
      try {
        await req.jwtVerify();
      } catch {
        throw new HttpError(401, 'Authentication required');
      }
    },
  );

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) {
      return reply.status(err.statusCode).send({ error: err.message });
    }
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: 'Validation failed', details: err.flatten() });
    }
    if ((err as { validation?: unknown }).validation) {
      return reply.status(400).send({ error: err.message });
    }
    req.log.error(err);
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    return reply.status(status).send({ error: status >= 500 ? 'Internal Server Error' : err.message });
  });

  app.get('/health', async () => ({ status: 'ok', service: 'vinylarium-api' }));

  await app.register(
    async (api) => {
      await api.register(authRoutes, { prefix: '/auth' });
      await api.register(userRoutes, { prefix: '/users' });
      await api.register(releaseRoutes, { prefix: '/releases' });
      await api.register(artistRoutes, { prefix: '/artists' });
      await api.register(importRoutes, { prefix: '/import' });
      await api.register(searchRoutes, { prefix: '/search' });
      await api.register(storageRoutes, { prefix: '/storage' });
      await api.register(statsRoutes, { prefix: '/stats' });
    },
    { prefix: '/api' },
  );

  return app;
}
