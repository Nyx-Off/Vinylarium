import { PrismaClient } from '@prisma/client';

/** Shared Prisma client (single instance per process). */
export const prisma = new PrismaClient({
  log: ['warn', 'error'],
});

export type { Prisma } from '@prisma/client';
