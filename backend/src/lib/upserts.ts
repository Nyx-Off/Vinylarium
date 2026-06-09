import { prisma } from '../db/prisma';
import { categorizeRole } from './discogs-roles';
import { geoForCountry } from './countries';
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

export async function upsertLabelByName(name: string, discogsLabelId?: number | null) {
  return prisma.label.upsert({
    where: { name },
    update: {},
    create: { name, discogsLabelId: discogsLabelId ?? null },
  });
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
