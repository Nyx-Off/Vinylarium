import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
import { notFound } from '../../lib/errors';
import { geoForISO } from '../../lib/countries';
import { mediaUrl } from '../../lib/storage';
import {
  artistOriginJobId,
  artistRelationsJobId,
  musicbrainzQueue,
} from '../../lib/queue';
import { toListItem } from '../releases/serialize';

export async function artistRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // ── Artist detail (fiche artiste) ─────────────────────────────────────
  app.get('/:id', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const artist = await prisma.artist.findUnique({
      where: { id },
      include: {
        originCountry: true,
        members: { orderBy: { position: 'asc' } },
        memberships: { include: { group: { select: { id: true, name: true } } } },
      },
    });
    if (!artist) throw notFound('Artist not found');

    // Albums billed under this artist, oldest first.
    const releaseLinks = await prisma.releaseArtist.findMany({
      where: { artistId: id },
      include: { release: true },
      orderBy: [{ release: { year: 'asc' } }, { release: { title: 'asc' } }],
    });
    const billedIds = new Set(releaseLinks.map((l) => l.releaseId));

    // Credited appearances on OTHER releases ("session player on…").
    const credits = await prisma.credit.findMany({
      where: { artistId: id },
      include: { release: true, role: true },
      orderBy: { position: 'asc' },
    });
    const appears = new Map<string, { release: any; roles: string[] }>();
    for (const c of credits) {
      if (billedIds.has(c.releaseId)) continue;
      const entry = appears.get(c.releaseId) ?? { release: c.release, roles: [] };
      const roleName = c.role?.name ?? c.rawRole ?? '';
      if (roleName && !entry.roles.includes(roleName)) entry.roles.push(roleName);
      appears.set(c.releaseId, entry);
    }

    const origin = artist.originCountry?.code
      ? {
          code: artist.originCountry.code,
          name: geoForISO(artist.originCountry.code)?.name ?? artist.originCountry.name,
        }
      : null;

    return {
      id: artist.id,
      name: artist.name,
      realName: artist.realName,
      profile: artist.profile,
      imageUrl: mediaUrl(artist.imagePath),
      discogsUri: artist.discogsUri,
      mbid: artist.mbid,
      type: artist.mbType, // "Group" | "Person" | …
      beginDate: artist.mbBeginDate,
      endDate: artist.mbEndDate,
      origin,
      originStatus: artist.originStatus,
      relationsStatus: artist.relationsStatus,
      members: artist.members.map((m) => ({
        id: m.id,
        artistId: m.memberId, // set when the member exists in the library
        name: m.name,
        attributes: m.attributes,
        beginDate: m.beginDate,
        endDate: m.endDate,
        ended: m.ended,
      })),
      memberOf: artist.memberships.map((ms) => ({
        artistId: ms.group.id,
        name: ms.group.name,
      })),
      releases: releaseLinks.map((l) => toListItem(l.release)),
      appearsOn: [...appears.values()].map((a) => ({
        ...toListItem(a.release),
        roles: a.roles,
      })),
    };
  });

  // ── Re-run the MusicBrainz lookups for this artist ────────────────────
  app.post('/:id/refresh', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const artist = await prisma.artist.findUnique({ where: { id } });
    if (!artist) throw notFound('Artist not found');

    await prisma.artist.update({
      where: { id },
      data: { originStatus: 'PENDING', relationsStatus: 'PENDING' },
    });
    // Stable jobIds dedupe adds — drop any previous (completed) jobs first so
    // the lookups really re-run.
    await musicbrainzQueue.remove(artistOriginJobId(id)).catch(() => undefined);
    await musicbrainzQueue.remove(artistRelationsJobId(id)).catch(() => undefined);
    await musicbrainzQueue.add('origin', { artistId: id }, { jobId: artistOriginJobId(id) });
    return { ok: true };
  });
}
