import '@fastify/jwt';
import type { FastifyReply, FastifyRequest } from 'fastify';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; username: string };
    user: { sub: string; username: string };
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    /** preHandler that verifies the JWT or throws 401. */
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
