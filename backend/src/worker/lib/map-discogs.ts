import { ImageType } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { downloadToStorage } from '../../lib/storage';
import { imageHeaders } from '../clients/discogs';
import { parseRole, splitRoles } from '../../lib/discogs-roles';
import {
  upsertArtistByDiscogs,
  upsertArtistByName,
  upsertCountry,
  upsertGenre,
  upsertLabelByName,
  upsertRole,
  upsertStyle,
} from '../../lib/upserts';
import { deriveDecade, deriveVersionFlags, durationToSeconds, parseYear, sortName } from '../../lib/text';

async function getArtist(entry: any) {
  if (entry?.id && Number.isFinite(entry.id) && entry.id > 0) {
    return upsertArtistByDiscogs(entry.id, entry.name);
  }
  return upsertArtistByName(entry.name);
}

/**
 * Populate a Release (and its relations) from a Discogs release payload.
 * Idempotent: Discogs-derived children are cleared and rebuilt, while
 * user-owned data (tags, lyrics, anecdotes, storage assignment) is preserved.
 */
export async function applyDiscogsRelease(releaseId: string, data: any): Promise<void> {
  const formats: any[] = Array.isArray(data.formats) ? data.formats : [];
  const descriptions: string[] = formats.flatMap((f) =>
    Array.isArray(f.descriptions) ? f.descriptions : [],
  );
  const styles: string[] = Array.isArray(data.styles) ? data.styles : [];
  const flags = deriveVersionFlags(descriptions, styles);
  const year = typeof data.year === 'number' && data.year > 0 ? data.year : parseYear(data.released);
  const masterId = data.master_id && data.master_id > 0 ? data.master_id : null;

  await prisma.release.update({
    where: { id: releaseId },
    data: {
      title: data.title || undefined,
      sortTitle: data.title ? sortName(data.title) : undefined,
      year: year ?? undefined,
      decade: deriveDecade(year ?? null),
      releasedRaw: data.released || undefined,
      releasedFormatted: data.released_formatted || undefined,
      country: data.country || undefined,
      notes: data.notes || undefined,
      dataQuality: data.data_quality || undefined,
      discogsMasterId: masterId,
      discogsUri: data.uri || undefined,
      thumbUrl: data.thumb || undefined,
      ...flags,
    },
  });

  if (data.country) {
    const country = await upsertCountry(data.country);
    await prisma.release.update({ where: { id: releaseId }, data: { countryId: country.id } });
  }

  // Clear Discogs-derived children before rebuilding (keep user data).
  await prisma.$transaction([
    prisma.releaseArtist.deleteMany({ where: { releaseId } }),
    prisma.credit.deleteMany({ where: { releaseId } }),
    prisma.releaseLabel.deleteMany({ where: { releaseId } }),
    prisma.releaseGenre.deleteMany({ where: { releaseId } }),
    prisma.releaseStyle.deleteMany({ where: { releaseId } }),
    prisma.releaseFormat.deleteMany({ where: { releaseId } }),
    prisma.track.deleteMany({ where: { releaseId } }),
    prisma.image.deleteMany({ where: { releaseId } }),
    prisma.identifier.deleteMany({ where: { releaseId } }),
    prisma.externalLink.deleteMany({ where: { releaseId, source: 'DISCOGS' } }),
  ]);

  // Billed artists
  const artists: any[] = Array.isArray(data.artists) ? data.artists : [];
  for (let i = 0; i < artists.length; i++) {
    const entry = artists[i];
    if (!entry?.name) continue;
    const artist = await getArtist(entry);
    await prisma.releaseArtist
      .create({
        data: {
          releaseId,
          artistId: artist.id,
          position: i,
          anv: entry.anv || null,
          joinRel: entry.join || null,
          role: entry.role || null,
        },
      })
      .catch(() => undefined);
  }

  // Credits — extraartists; role may be comma-joined ("Producer, Written-By").
  const extra: any[] = Array.isArray(data.extraartists) ? data.extraartists : [];
  let cpos = 0;
  for (const entry of extra) {
    if (!entry?.name || !entry?.role) continue;
    const artist = await getArtist(entry);
    for (const raw of splitRoles(entry.role)) {
      const { base, detail } = parseRole(raw);
      if (!base) continue;
      const role = await upsertRole(base);
      await prisma.credit.create({
        data: {
          releaseId,
          artistId: artist.id,
          roleId: role.id,
          detail: detail,
          tracks: entry.tracks || null,
          rawRole: raw,
          position: cpos++,
        },
      });
    }
  }

  // Labels
  const labels: any[] = Array.isArray(data.labels) ? data.labels : [];
  const seenLabel = new Set<string>();
  for (const l of labels) {
    if (!l?.name) continue;
    const label = await upsertLabelByName(l.name, l.id);
    const catno = l.catno || '';
    const key = `${label.id}|${catno}`;
    if (seenLabel.has(key)) continue;
    seenLabel.add(key);
    await prisma.releaseLabel
      .create({ data: { releaseId, labelId: label.id, catno } })
      .catch(() => undefined);
  }

  // Genres & styles
  for (const g of Array.isArray(data.genres) ? data.genres : []) {
    const genre = await upsertGenre(g);
    await prisma.releaseGenre.create({ data: { releaseId, genreId: genre.id } }).catch(() => undefined);
  }
  for (const s of styles) {
    const style = await upsertStyle(s);
    await prisma.releaseStyle.create({ data: { releaseId, styleId: style.id } }).catch(() => undefined);
  }

  // Formats
  for (const f of formats) {
    await prisma.releaseFormat.create({
      data: {
        releaseId,
        name: f.name || 'Unknown',
        qty: f.qty || null,
        text: f.text || null,
        descriptions: Array.isArray(f.descriptions) ? f.descriptions : [],
      },
    });
  }

  // Tracklist
  const tracks: any[] = Array.isArray(data.tracklist) ? data.tracklist : [];
  let ti = 0;
  for (const t of tracks) {
    await prisma.track.create({
      data: {
        releaseId,
        position: t.position || null,
        title: t.title || '',
        duration: t.duration || null,
        durationSec: durationToSeconds(t.duration),
        trackIndex: ti++,
        type: t.type_ || 'track',
      },
    });
  }

  // Images (metadata only; bytes are downloaded for the cover below)
  const images: any[] = Array.isArray(data.images) ? data.images : [];
  let ii = 0;
  for (const img of images) {
    await prisma.image.create({
      data: {
        releaseId,
        type: img.type === 'primary' ? ImageType.PRIMARY : ImageType.SECONDARY,
        sourceUrl: img.uri || null,
        width: typeof img.width === 'number' ? img.width : null,
        height: typeof img.height === 'number' ? img.height : null,
        position: ii++,
      },
    });
  }

  // Identifiers (barcode, matrix/runout, ...)
  for (const id of Array.isArray(data.identifiers) ? data.identifiers : []) {
    if (!id?.type || id?.value == null) continue;
    await prisma.identifier.create({
      data: { releaseId, type: id.type, value: String(id.value), description: id.description || null },
    });
  }

  // External link back to Discogs
  if (data.uri) {
    await prisma.externalLink.create({
      data: { releaseId, source: 'DISCOGS', url: data.uri, externalId: data.id ? String(data.id) : null },
    });
  }

  await downloadCovers(releaseId, data);
}

function imageExt(url: string): string {
  return (url.match(/\.(jpe?g|png|gif|webp)(\?|$)/i)?.[1] || 'jpg').toLowerCase();
}

/**
 * Download the front cover and (when available) a back cover. Discogs serves
 * images from a CDN that rejects browser hotlinks, so the bytes must be
 * fetched server-side and stored locally for the UI to display them.
 */
async function downloadCovers(releaseId: string, data: any): Promise<void> {
  const images: any[] = Array.isArray(data.images) ? data.images : [];

  // Front: the "primary" image, falling back to the first image / thumbnail.
  const primary = images.find((i) => i.type === 'primary') ?? images[0];
  const frontUrl: string | undefined = primary?.uri || data.thumb;
  if (frontUrl) {
    const rel = await downloadToStorage(
      frontUrl,
      'covers',
      `${releaseId}.${imageExt(frontUrl)}`,
      imageHeaders(),
    );
    if (rel) await prisma.release.update({ where: { id: releaseId }, data: { coverPath: rel } });
  }

  // Back: the first image that isn't the chosen front (usually the verso).
  const back = images.find((i) => i !== primary && i?.uri);
  if (back?.uri) {
    const rel = await downloadToStorage(
      back.uri,
      'covers',
      `${releaseId}-back.${imageExt(back.uri)}`,
      imageHeaders(),
    );
    if (rel) await prisma.release.update({ where: { id: releaseId }, data: { backCoverPath: rel } });
  }
}
