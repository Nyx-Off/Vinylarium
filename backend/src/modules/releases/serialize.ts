import { RoleCategory } from '@prisma/client';
import { mediaUrl } from '../../lib/storage';

/** Prisma include used to load a full release detail. */
export const releaseDetailInclude = {
  artists: { include: { artist: true }, orderBy: { position: 'asc' } },
  credits: { include: { artist: true, role: true }, orderBy: { position: 'asc' } },
  labels: { include: { label: true } },
  genres: { include: { genre: true } },
  styles: { include: { style: true } },
  formats: true,
  tracks: { orderBy: { trackIndex: 'asc' } },
  images: { orderBy: { position: 'asc' } },
  lyrics: true,
  anecdotes: { orderBy: { createdAt: 'desc' } },
  tags: { include: { tag: true } },
  externalLinks: true,
  identifiers: true,
  storageLocation: true,
  countryRef: true,
} as const;

export function coverUrlOf(r: any): string | null {
  return mediaUrl(r.coverPath) ?? r.thumbUrl ?? null;
}

/** Lightweight DTO for grids / walls / carousels. */
export function toListItem(r: any) {
  return {
    id: r.id,
    title: r.title,
    artistDisplay: r.artistDisplay,
    year: r.year,
    decade: r.decade,
    country: r.country,
    catalogNumber: r.catalogNumber,
    rating: r.rating,
    coverUrl: coverUrlOf(r),
    enrichmentStatus: r.enrichmentStatus,
    isLive: r.isLive,
    isStudio: r.isStudio,
    isCompilation: r.isCompilation,
    isSpecialEdition: r.isSpecialEdition,
    storageLocationId: r.storageLocationId,
    storageSlot: r.storageSlot,
  };
}

function artistRef(a: any) {
  return { id: a.id, name: a.name, imageUrl: mediaUrl(a.imagePath) };
}

/** Full DTO for the release detail page. */
export function toDetail(r: any) {
  const credits = (r.credits ?? []).map((c: any) => ({
    id: c.id,
    artist: artistRef(c.artist),
    role: c.role?.name ?? c.rawRole,
    category: c.role?.category ?? RoleCategory.OTHER,
    detail: c.detail,
    tracks: c.tracks,
  }));

  // Convenience groupings for the UI (musicians / singers / authors / producers).
  const byCategory = (cat: RoleCategory) => credits.filter((c: any) => c.category === cat);

  return {
    id: r.id,
    source: r.source,
    enrichmentStatus: r.enrichmentStatus,
    enrichmentError: r.enrichmentError,
    discogsReleaseId: r.discogsReleaseId,
    discogsMasterId: r.discogsMasterId,
    discogsUri: r.discogsUri,
    title: r.title,
    artistDisplay: r.artistDisplay,
    year: r.year,
    decade: r.decade,
    released: r.releasedFormatted ?? r.releasedRaw,
    country: r.country,
    catalogNumber: r.catalogNumber,
    notes: r.notes,
    rating: r.rating,
    mediaCondition: r.mediaCondition,
    sleeveCondition: r.sleeveCondition,
    collectionFolder: r.collectionFolder,
    coverUrl: coverUrlOf(r),
    backCoverUrl: mediaUrl(r.backCoverPath),
    flags: {
      isStudio: r.isStudio,
      isLive: r.isLive,
      isCompilation: r.isCompilation,
      isReissue: r.isReissue,
      isRemaster: r.isRemaster,
      isSpecialEdition: r.isSpecialEdition,
    },
    artists: (r.artists ?? []).map((ra: any) => ({
      ...artistRef(ra.artist),
      anv: ra.anv,
      joinRel: ra.joinRel,
    })),
    credits,
    musicians: byCategory(RoleCategory.INSTRUMENT),
    singers: byCategory(RoleCategory.VOCAL),
    authors: byCategory(RoleCategory.WRITING),
    producers: byCategory(RoleCategory.PRODUCTION),
    labels: (r.labels ?? []).map((rl: any) => ({
      id: rl.label.id,
      name: rl.label.name,
      catno: rl.catno || null,
    })),
    genres: (r.genres ?? []).map((g: any) => g.genre.name),
    styles: (r.styles ?? []).map((s: any) => s.style.name),
    formats: (r.formats ?? []).map((f: any) => ({
      name: f.name,
      qty: f.qty,
      text: f.text,
      descriptions: f.descriptions,
    })),
    tracklist: (r.tracks ?? []).map((t: any) => ({
      id: t.id,
      position: t.position,
      title: t.title,
      duration: t.duration,
      type: t.type,
    })),
    images: (r.images ?? []).map((img: any) => ({
      id: img.id,
      type: img.type,
      url: mediaUrl(img.localPath) ?? img.sourceUrl,
    })),
    lyrics: (r.lyrics ?? []).map((l: any) => ({
      id: l.id,
      trackId: l.trackId,
      text: l.text,
      source: l.source,
      sourceUrl: l.sourceUrl,
    })),
    anecdotes: (r.anecdotes ?? []).map((a: any) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      source: a.source,
      sourceUrl: a.sourceUrl,
    })),
    identifiers: (r.identifiers ?? []).map((i: any) => ({
      type: i.type,
      value: i.value,
      description: i.description,
    })),
    externalLinks: (r.externalLinks ?? []).map((e: any) => ({
      source: e.source,
      url: e.url,
    })),
    tags: (r.tags ?? []).map((t: any) => ({ id: t.tag.id, name: t.tag.name, color: t.tag.color })),
    storage: r.storageLocation
      ? {
          id: r.storageLocation.id,
          label: r.storageLocation.label,
          slot: r.storageSlot,
        }
      : null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}
