import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
import { hashPassword, verifyPassword } from '../../lib/password';
import { conflict, unauthorized } from '../../lib/errors';
import { publicUser } from '../users/serialize';

const usernameSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[\p{L}\p{N}_\-. ]+$/u, 'Invalid characters in username');

export async function authRoutes(app: FastifyInstance) {
  // Is this a fresh install (no users yet)?
  app.get('/setup', async () => {
    const count = await prisma.user.count();
    return { needsSetup: count === 0 };
  });

  // Create a profile. Open by design (local, trusted, Plex-style "+ add user").
  app.post('/register', async (req) => {
    const body = z
      .object({
        username: usernameSchema,
        displayName: z.string().trim().min(1).max(60).optional(),
        password: z.string().min(1).max(200).optional(),
      })
      .parse(req.body);

    const existing = await prisma.user.findUnique({ where: { username: body.username } });
    if (existing) throw conflict('Username already taken');

    const count = await prisma.user.count();
    const user = await prisma.user.create({
      data: {
        username: body.username,
        displayName: body.displayName?.trim() || body.username,
        passwordHash: body.password ? await hashPassword(body.password) : null,
        isAdmin: count === 0, // first user becomes the admin
      },
    });

    const token = app.jwt.sign({ sub: user.id, username: user.username });
    return { token, user: publicUser(user) };
  });

  // Login: passwordless profiles authenticate with username only.
  app.post('/login', async (req) => {
    const body = z
      .object({ username: usernameSchema, password: z.string().optional() })
      .parse(req.body);

    const user = await prisma.user.findUnique({ where: { username: body.username } });
    if (!user) throw unauthorized('Invalid credentials');

    if (user.passwordHash) {
      if (!body.password || !(await verifyPassword(body.password, user.passwordHash))) {
        throw unauthorized('Invalid credentials');
      }
    }

    const token = app.jwt.sign({ sub: user.id, username: user.username });
    return { token, user: publicUser(user) };
  });

  // Current user (with preferences).
  app.get('/me', { preHandler: app.authenticate }, async (req) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
    if (!user) throw unauthorized();
    return { user: { ...publicUser(user), preferences: user.preferences } };
  });
}
