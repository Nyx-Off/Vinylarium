import { prisma } from '../../db/prisma';
import { genius } from '../clients/genius';

/**
 * Fetch the Genius album description ("about" annotation) and store it as a
 * GENIUS-sourced anecdote. Manual anecdotes are never touched, and existing
 * Genius anecdotes are only replaced once a fresh one is in hand — a transient
 * Genius failure must not wipe what we already have.
 */
export async function processAlbumAnecdote(releaseId: string): Promise<void> {
  if (!genius.hasAuth()) return;
  const release = await prisma.release.findUnique({
    where: { id: releaseId },
    include: { tracks: { orderBy: { trackIndex: 'asc' } } },
  });
  if (!release) return;

  const trackTitles = release.tracks
    .filter((t) => t.type === 'track' && t.title.trim().length > 0)
    .map((t) => t.title);
  const info = await genius.getAlbumInfo(release.artistDisplay, release.title, trackTitles);
  if (!info) return;

  await prisma.$transaction([
    prisma.anecdote.deleteMany({ where: { releaseId, source: 'GENIUS' } }),
    prisma.anecdote.create({
      data: {
        releaseId,
        title: `À propos de « ${info.name} »`,
        body: info.description,
        source: 'GENIUS',
        sourceUrl: info.url || null,
      },
    }),
  ]);
}
