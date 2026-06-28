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
import { deriveDecade, deriveVersionFlags, durationToSeconds, isPlaceholderArtist, parseYear, sortName } from '../../lib/text';

async function getArtist(entry: any) {
  if (entry?.id && Number.isFinite(entry.id) && entry.id > 0) {
    return upsertArtistByDiscogs(entry.id, entry.name);
  }
  return upsertArtistByName(entry.name);
}

/**
 * Render a per-track artist string from a Discogs tracklist entry's `artists`
 * array. Compilations/soundtracks bill the release as "Various" but each track
 * carries its real artist here — keeping it lets the lyrics lookup search the
 * right artist. Uses the artist name variation (`anv`) when present and honours
 * the Discogs `join` separator (" / ", " & ", "feat.", …). Returns null when
 * the track has no per-track artist (the common single-artist album case).
 */
function trackArtistDisplay(t: any): string | null {
  const arr: any[] = Array.isArray(t?.artists) ? t.artists : [];
  if (arr.length === 0) return null;
  let out = '';
  arr.forEach((a, i) => {
    const name = (a?.anv || a?.name || '').trim();
    if (!name) return;
    if (i > 0) {
      // Discogs stores the separator on the PRECEDING artist's `join`.
      const sep = String(arr[i - 1]?.join ?? '').trim();
      out += sep ? ` ${sep} ` : ' ';
    }
    out += name;
  });
  out = out.replace(/\s+/g, ' ').trim();
  // "Unknown Artist"/"No Artist" are Discogs placeholders, not a real artist.
  if (out.length === 0 || isPlaceholderArtist(out)) return null;
  return out;
}

/**
 * Populate a Release (and its relations) from a Discogs release payload.
 * Idempotent: Discogs-derived children are cleared and rebuilt, while
 * user-owned data (tags, lyrics, anecdotes, storage assignment) is preserved.
 */
export async function applyDiscogsRelease(
  releaseId: string,
  data: any,
  masterYear: number | null = null,
): Promise<void> {
  const formats: any[] = Array.isArray(data.formats) ? data.formats : [];
  const descriptions: string[] = formats.flatMap((f) =>
    Array.isArray(f.descriptions) ? f.descriptions : [],
  );
  const styles: string[] = Array.isArray(data.styles) ? data.styles : [];
  const flags = deriveVersionFlags(descriptions, styles);
  // The Discogs release year is the year of THIS pressing; the music's
  // original year comes from the master. `Release.year` (what the whole app
  // sorts/filters/displays on) is the original one.
  const pressingYear =
    typeof data.year === 'number' && data.year > 0 ? data.year : parseYear(data.released);
  const year = masterYear ?? pressingYear;
  const masterId = data.master_id && data.master_id > 0 ? data.master_id : null;

  await prisma.release.update({
    where: { id: releaseId },
    data: {
      title: data.title || undefined,
      sortTitle: data.title ? sortName(data.title) : undefined,
      year: year ?? undefined,
      pressingYear: pressingYear ?? undefined,
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
  const seenCredit = new Set<string>(); // artistId|roleId|detail
  for (const entry of extra) {
    if (!entry?.name || !entry?.role) continue;
    const artist = await getArtist(entry);
    for (const raw of splitRoles(entry.role)) {
      const { base, detail } = parseRole(raw);
      if (!base) continue;
      const role = await upsertRole(base);
      seenCredit.add(`${artist.id}|${role.id}|${detail ?? ''}`);
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

  // Per-track credits — Discogs nests many musician credits (often with the
  // exact instrument model, e.g. "Synthesizer [Yamaha DX7]") under
  // tracklist[].extraartists instead of the release-level list. Merge them by
  // artist+role+detail, accumulating track positions, and skip lines the
  // release-level credits already carry.
  const perTrack = new Map<
    string,
    { artistId: string; roleId: string; detail: string | null; raw: string; positions: string[] }
  >();
  const collectTrackCredits = async (t: any) => {
    const pos = typeof t?.position === 'string' ? t.position.trim() : '';
    for (const entry of Array.isArray(t?.extraartists) ? t.extraartists : []) {
      if (!entry?.name || !entry?.role) continue;
      const artist = await getArtist(entry);
      for (const raw of splitRoles(entry.role)) {
        const { base, detail } = parseRole(raw);
        if (!base) continue;
        const role = await upsertRole(base);
        const key = `${artist.id}|${role.id}|${detail ?? ''}`;
        if (seenCredit.has(key)) continue;
        const acc = perTrack.get(key);
        if (acc) {
          if (pos && !acc.positions.includes(pos)) acc.positions.push(pos);
        } else {
          perTrack.set(key, {
            artistId: artist.id,
            roleId: role.id,
            detail,
            raw,
            positions: pos ? [pos] : [],
          });
        }
      }
    }
    // Index tracks (medleys, suites) nest their parts under sub_tracks.
    for (const sub of Array.isArray(t?.sub_tracks) ? t.sub_tracks : []) {
      await collectTrackCredits(sub);
    }
  };
  for (const t of Array.isArray(data.tracklist) ? data.tracklist : []) {
    await collectTrackCredits(t);
  }
  for (const c of perTrack.values()) {
    await prisma.credit.create({
      data: {
        releaseId,
        artistId: c.artistId,
        roleId: c.roleId,
        detail: c.detail,
        tracks: c.positions.join(', ') || null,
        rawRole: c.raw,
        position: cpos++,
      },
    });
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
        artistDisplay: trackArtistDisplay(t),
        duration: t.duration || null,
        durationSec: durationToSeconds(t.duration),
        trackIndex: ti++,
        type: t.type_ || 'track',
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

  await applyImages(releaseId, data);
}

function imageExt(url: string): string {
  return (url.match(/\.(jpe?g|png|gif|webp)(\?|$)/i)?.[1] || 'jpg').toLowerCase();
}

/**
 * Download EVERY Discogs image and keep its semantics. Discogs serves images
 * from a CDN that rejects browser hotlinks, so bytes must be fetched
 * server-side and stored locally for the UI to display them.
 *
 * Discogs only distinguishes "primary" vs "secondary"; by convention the
 * primary is the front sleeve and the next image is the verso. We persist
 * that as PRIMARY / BACK / SECONDARY so the UI can label the gallery, and we
 * mirror front/back onto Release.coverPath/backCoverPath for the grids.
 */
async function applyImages(releaseId: string, data: any): Promise<void> {
  const images: any[] = (Array.isArray(data.images) ? data.images : []).filter((i: any) => i?.uri);
  const primaryIdx = Math.max(0, images.findIndex((i) => i.type === 'primary'));
  const backIdx = images.length > 1 ? (primaryIdx === 0 ? 1 : 0) : -1;

  let coverPath: string | null = null;
  let backPath: string | null = null;

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const kind = i === primaryIdx ? ImageType.PRIMARY : i === backIdx ? ImageType.BACK : ImageType.SECONDARY;
    const ext = imageExt(img.uri);
    const filename =
      kind === ImageType.PRIMARY
        ? `${releaseId}.${ext}`
        : kind === ImageType.BACK
          ? `${releaseId}-back.${ext}`
          : `${releaseId}-img-${i}.${ext}`;
    const rel = await downloadToStorage(img.uri, 'covers', filename, imageHeaders());
    await prisma.image.create({
      data: {
        releaseId,
        type: kind,
        localPath: rel,
        sourceUrl: img.uri,
        width: typeof img.width === 'number' ? img.width : null,
        height: typeof img.height === 'number' ? img.height : null,
        position: i,
      },
    });
    if (kind === ImageType.PRIMARY && rel) coverPath = rel;
    if (kind === ImageType.BACK && rel) backPath = rel;
  }

  // No usable image array (e.g. anonymous Discogs API): fall back to the
  // CSV/search thumbnail for the front cover.
  if (!coverPath && data.thumb) {
    coverPath = await downloadToStorage(
      data.thumb,
      'covers',
      `${releaseId}.${imageExt(data.thumb)}`,
      imageHeaders(),
    );
  }

  // Only overwrite what we managed to download — keeps manual uploads when
  // Discogs has nothing better.
  await prisma.release.update({
    where: { id: releaseId },
    data: {
      ...(coverPath ? { coverPath } : {}),
      ...(backPath ? { backCoverPath: backPath } : {}),
    },
  });
}
