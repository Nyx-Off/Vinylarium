import { Prisma, RoleCategory } from '@prisma/client';
import { z } from 'zod';

const boolish = z
  .union([z.boolean(), z.string()])
  .transform((v) => v === true || v === 'true' || v === '1')
  .optional();

export const releaseQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  artistId: z.string().optional(),
  role: z.string().optional(), // role name, e.g. "Bass" (for "X plays bass")
  roleCategory: z.nativeEnum(RoleCategory).optional(),
  genre: z.string().optional(),
  style: z.string().optional(),
  label: z.string().optional(),
  country: z.string().optional(),
  // ISO code — releases whose billed artist originates from this country.
  origin: z
    .string()
    .trim()
    .length(2)
    .transform((s) => s.toUpperCase())
    .optional(),
  tag: z.string().optional(),
  storageLocationId: z.string().optional(),
  year: z.coerce.number().int().optional(),
  decade: z.coerce.number().int().optional(),
  live: boolish,
  studio: boolish,
  compilation: boolish,
  special: boolish,
  reissue: boolish,
  remaster: boolish,
  enrichmentStatus: z.string().optional(),
  sort: z
    .enum(['addedDesc', 'addedAsc', 'title', 'artist', 'yearAsc', 'yearDesc', 'ratingDesc'])
    .default('addedDesc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(1000).default(60),
});

export type ReleaseQuery = z.infer<typeof releaseQuerySchema>;

/** Build a Prisma `where` from validated query params. */
export function buildReleaseWhere(qp: ReleaseQuery): Prisma.ReleaseWhereInput {
  const and: Prisma.ReleaseWhereInput[] = [];

  if (qp.q) {
    and.push({
      OR: [
        { title: { contains: qp.q, mode: 'insensitive' } },
        { artistDisplay: { contains: qp.q, mode: 'insensitive' } },
        { notes: { contains: qp.q, mode: 'insensitive' } },
        { catalogNumber: { contains: qp.q, mode: 'insensitive' } },
      ],
    });
  }

  if (qp.year !== undefined) and.push({ year: qp.year });
  if (qp.decade !== undefined) and.push({ decade: qp.decade });
  if (qp.country) and.push({ country: { equals: qp.country, mode: 'insensitive' } });
  if (qp.origin)
    and.push({ artists: { some: { artist: { originCountry: { code: qp.origin } } } } });
  if (qp.genre) and.push({ genres: { some: { genre: { name: qp.genre } } } });
  if (qp.style) and.push({ styles: { some: { style: { name: qp.style } } } });
  if (qp.label) and.push({ labels: { some: { label: { name: qp.label } } } });
  if (qp.tag) and.push({ tags: { some: { tag: { name: qp.tag } } } });
  if (qp.storageLocationId) and.push({ storageLocationId: qp.storageLocationId });
  if (qp.enrichmentStatus) and.push({ enrichmentStatus: qp.enrichmentStatus as any });

  if (qp.live) and.push({ isLive: true });
  if (qp.studio) and.push({ isStudio: true });
  if (qp.compilation) and.push({ isCompilation: true });
  if (qp.special) and.push({ isSpecialEdition: true });
  if (qp.reissue) and.push({ isReissue: true });
  if (qp.remaster) and.push({ isRemaster: true });

  // Artist / role combinations — the engine behind "artist X plays Bass".
  const roleFilter: Prisma.RoleWhereInput = {};
  if (qp.role) roleFilter.name = qp.role;
  if (qp.roleCategory) roleFilter.category = qp.roleCategory;
  const hasCreditFilter = Object.keys(roleFilter).length > 0;

  const creditWhere: Prisma.CreditWhereInput = {};
  if (qp.artistId) creditWhere.artistId = qp.artistId;
  if (hasCreditFilter) creditWhere.role = roleFilter;

  if (qp.artistId && !hasCreditFilter) {
    // Any involvement: billed artist OR any credit.
    and.push({
      OR: [{ artists: { some: { artistId: qp.artistId } } }, { credits: { some: { artistId: qp.artistId } } }],
    });
  } else if (Object.keys(creditWhere).length > 0) {
    and.push({ credits: { some: creditWhere } });
  }

  return and.length ? { AND: and } : {};
}

export function buildReleaseOrderBy(
  sort: ReleaseQuery['sort'],
): Prisma.ReleaseOrderByWithRelationInput[] {
  switch (sort) {
    case 'addedAsc':
      return [{ createdAt: 'asc' }];
    case 'title':
      return [{ sortTitle: 'asc' }, { title: 'asc' }];
    case 'artist':
      return [{ artistDisplay: 'asc' }, { year: 'asc' }];
    case 'yearAsc':
      return [{ year: 'asc' }, { title: 'asc' }];
    case 'yearDesc':
      return [{ year: 'desc' }, { title: 'asc' }];
    case 'ratingDesc':
      return [{ rating: 'desc' }, { createdAt: 'desc' }];
    case 'addedDesc':
    default:
      return [{ createdAt: 'desc' }];
  }
}
