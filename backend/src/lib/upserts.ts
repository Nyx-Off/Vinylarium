import { prisma } from '../db/prisma';
import { categorizeRole } from './discogs-roles';
import { CountryGeo, geoForCountry } from './countries';
import { sortName } from './text';

/** Find-or-create helpers shared by manual add (API) and enrichment (worker). */

export async function upsertRole(name: string) {
  return prisma.role.upsert({
    where: { name },
    update: {},
    create: { name, category: categorizeRole(name) },
  });
}

export async function upsertGenre(name: string) {
  return prisma.genre.upsert({ where: { name }, update: {}, create: { name } });
}

export async function upsertStyle(name: string) {
  return prisma.style.upsert({ where: { name }, update: {}, create: { name } });
}

export async function upsertTag(name: string, color?: string | null) {
  return prisma.tag.upsert({
    where: { name },
    update: {},
    create: { name, color: color ?? null },
  });
}

export async function upsertCountry(name: string) {
  const geo = geoForCountry(name);
  const geoData = geo ? { code: geo.code, latitude: geo.lat, longitude: geo.lng } : {};
  return prisma.country.upsert({
    where: { name },
    update: geoData,
    create: { name, ...geoData },
  });
}

/**
 * Find-or-create a country from a resolved geo entry (artist origins). Reuses
 * any row already carrying the ISO code — e.g. one created from a Discogs
 * pressing string like "US" — instead of duplicating it per naming variant.
 */
export async function upsertCountryByGeo(geo: CountryGeo) {
  const existing = await prisma.country.findFirst({ where: { code: geo.code } });
  if (existing) {
    if (existing.latitude == null || existing.longitude == null) {
      return prisma.country.update({
        where: { id: existing.id },
        data: { latitude: geo.lat, longitude: geo.lng },
      });
    }
    return existing;
  }
  return prisma.country.upsert({
    where: { name: geo.name },
    update: { code: geo.code, latitude: geo.lat, longitude: geo.lng },
    create: { name: geo.name, code: geo.code, latitude: geo.lat, longitude: geo.lng },
  });
}

export async function upsertLabelByName(name: string, discogsLabelId?: number | null) {
  // Resolve by the stable Discogs id FIRST: the same label resurfaces under
  // slightly different name strings ("Barclay" vs "Barclay (2)"), so keying
  // only on `name` would try to create a second row with an already-used
  // discogsLabelId and blow up on its unique constraint — which left releases
  // stuck FAILED. Fall back to name for label-less rows.
  if (discogsLabelId != null) {
    const byId = await prisma.label.findUnique({ where: { discogsLabelId } });
    if (byId) return byId;
  }
  const byName = await prisma.label.findUnique({ where: { name } });
  if (byName) return byName;
  try {
    return await prisma.label.create({ data: { name, discogsLabelId: discogsLabelId ?? null } });
  } catch (e) {
    // A parallel enrich job (concurrency: 4) won the create race — re-resolve
    // by id then name instead of failing the whole release.
    if (discogsLabelId != null) {
      const byId = await prisma.label.findUnique({ where: { discogsLabelId } });
      if (byId) return byId;
    }
    const again = await prisma.label.findUnique({ where: { name } });
    if (again) return again;
    throw e;
  }
}

export async function upsertArtistByName(name: string) {
  const existing = await prisma.artist.findFirst({ where: { name } });
  if (existing) return existing;
  return prisma.artist.create({ data: { name, sortName: sortName(name) } });
}

export async function upsertArtistByDiscogs(discogsArtistId: number, name: string) {
  return prisma.artist.upsert({
    where: { discogsArtistId },
    update: { name, sortName: sortName(name) },
    create: { discogsArtistId, name, sortName: sortName(name) },
  });
}
