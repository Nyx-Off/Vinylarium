import { prisma } from '../db/prisma';
import { allKnownRoles } from './discogs-roles';

/**
 * Idempotently seed the canonical Role rows so credit-category filters
 * (musicians / singers / authors / producers) have data even before the first
 * enrichment. Roles encountered during enrichment are upserted on the fly too.
 */
export async function seedRoles(): Promise<void> {
  const roles = allKnownRoles();
  await prisma.$transaction(
    roles.map((r) =>
      prisma.role.upsert({
        where: { name: r.name },
        update: { category: r.category },
        create: { name: r.name, category: r.category },
      }),
    ),
  );
}
