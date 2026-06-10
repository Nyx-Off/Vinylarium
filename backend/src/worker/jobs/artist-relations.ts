import { prisma } from '../../db/prisma';
import { musicbrainz, MbMember, MusicBrainzError } from '../clients/musicbrainz';

/**
 * Link a MusicBrainz member to an Artist row of our library: by mbid first,
 * then by exact name when unambiguous (so the UI can make the member
 * clickable when the person also appears in the collection's credits).
 */
async function findLibraryArtist(mbid: string | null, name: string): Promise<string | null> {
  if (mbid) {
    const byMbid = await prisma.artist.findFirst({ where: { mbid }, select: { id: true } });
    if (byMbid) return byMbid.id;
  }
  const byName = await prisma.artist.findMany({
    where: { name: { equals: name, mode: 'insensitive' } },
    select: { id: true },
    take: 2,
  });
  return byName.length === 1 ? byName[0].id : null;
}

/** Current members first, then by join date, then alphabetically. */
function memberOrder(a: MbMember, b: MbMember): number {
  if (a.ended !== b.ended) return a.ended ? 1 : -1;
  const ba = a.begin ?? '';
  const bb = b.begin ?? '';
  if (ba !== bb) return ba < bb ? -1 : 1;
  return a.name.localeCompare(b.name);
}

/**
 * Fetch MusicBrainz artist relations (band members, type, active period) for
 * an artist whose mbid is already known. Throws on transient errors so BullMQ
 * retries; the worker marks FAILED once attempts are exhausted.
 */
export async function processArtistRelations(artistId: string): Promise<void> {
  const artist = await prisma.artist.findUnique({ where: { id: artistId } });
  if (!artist?.mbid) return;

  let detail;
  try {
    detail = await musicbrainz.getArtist(artist.mbid);
  } catch (e) {
    if (e instanceof MusicBrainzError && e.notFound) {
      await prisma.artist.update({
        where: { id: artistId },
        data: { relationsStatus: 'NOT_FOUND', relationsCheckedAt: new Date() },
      });
      return; // mbid no longer resolvable — final
    }
    throw e;
  }

  // MusicBrainz-owned rows: clear + rebuild (idempotent re-runs).
  await prisma.bandMember.deleteMany({ where: { groupId: artistId } });
  const members = [...detail.members].sort(memberOrder);
  let pos = 0;
  for (const m of members) {
    const memberId = await findLibraryArtist(m.mbid, m.name);
    await prisma.bandMember.create({
      data: {
        groupId: artistId,
        memberId: memberId === artistId ? null : memberId,
        name: m.name,
        mbid: m.mbid,
        attributes: m.attributes,
        beginDate: m.begin,
        endDate: m.end,
        ended: m.ended,
        position: pos++,
      },
    });
  }

  await prisma.artist.update({
    where: { id: artistId },
    data: {
      mbType: detail.type,
      mbBeginDate: detail.beginDate,
      mbEndDate: detail.endDate,
      relationsStatus: 'FOUND',
      relationsCheckedAt: new Date(),
    },
  });
}
