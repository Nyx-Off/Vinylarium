import { RoleCategory } from '@prisma/client';
import { mediaUrl } from '../../lib/storage';

/** Prisma include used to load a full release detail. */
export const releaseDetailInclude = {
  artists: {
    include: { artist: { include: { members: { orderBy: { position: 'asc' } } } } },
    orderBy: { position: 'asc' },
  },
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

/** Grid/bin cover: prefer the downsized thumbnail, fall back to the full cover. */
export function coverThumbUrlOf(r: any): string | null {
  return mediaUrl(r.coverThumbPath) ?? mediaUrl(r.coverPath) ?? r.thumbUrl ?? null;
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
    hidden: r.hidden,
    coverUrl: coverThumbUrlOf(r),
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

const dateYear = (d: string | null) => {
  const y = d ? parseInt(d.slice(0, 4), 10) : NaN;
  return Number.isFinite(y) ? y : null;
};

/**
 * The line-up of each billed group at the time the record came out, inferred
 * from MusicBrainz member periods. Ex-members with no dates at all cannot be
 * placed and are left out; current undated members always show.
 */
function buildLineup(r: any) {
  const year: number | null = r.year ?? null;
  const lineup: any[] = [];
  for (const ra of r.artists ?? []) {
    const members: any[] = ra.artist?.members ?? [];
    if (members.length === 0) continue;
    const active = members.filter((m) => {
      const begin = dateYear(m.beginDate);
      const end = dateYear(m.endDate);
      if (m.ended && begin == null && end == null) return false;
      if (year == null) return !m.ended; // undated release: show current members
      return (begin == null || begin <= year) && (end == null || end >= year);
    });
    if (active.length === 0) continue;
    lineup.push({
      artistId: ra.artist.id,
      artistName: ra.artist.name,
      members: active.map((m) => ({
        artistId: m.memberId,
        name: m.name,
        attributes: m.attributes ?? [],
        beginDate: m.beginDate,
        endDate: m.endDate,
        ended: m.ended,
      })),
    });
  }
  return lineup;
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
    pressingYear: r.pressingYear,
    decade: r.decade,
    hidden: r.hidden,
    released: r.releasedFormatted ?? r.releasedRaw,
    country: r.country,
    catalogNumber: r.catalogNumber,
    notes: r.notes,
    rating: r.rating,
    mediaCondition: r.mediaCondition,
    sleeveCondition: r.sleeveCondition,
    collectionFolder: r.collectionFolder,
    market: {
      lowestPrice: r.lowestPrice ?? null,
      currency: r.priceCurrency ?? null,
      numForSale: r.numForSale ?? null,
      have: r.communityHave ?? null,
      want: r.communityWant ?? null,
    },
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
    lineup: buildLineup(r),
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
    // Only locally stored bytes — the Discogs CDN rejects browser hotlinks,
    // so a sourceUrl fallback would just render broken images.
    images: (r.images ?? []).map((img: any) => ({
      id: img.id,
      type: img.type,
      url: mediaUrl(img.localPath),
      width: img.width,
      height: img.height,
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
          // When the location is a 3D-furniture cell, expose its coordinates so
          // the release sheet can deep-link to it, plus the disc's exact spot.
          furnitureId: r.storageLocation.furnitureId ?? null,
          cellX: r.storageLocation.cellX ?? null,
          cellY: r.storageLocation.cellY ?? null,
          position: r.storagePosition ?? null,
        }
      : null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}
