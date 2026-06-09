import { prisma } from '../../db/prisma';
import { genius } from '../clients/genius';

const MAX_TRACKS = 40;
const GAP_MS = 350; // be polite between Genius requests

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Best-effort: fetch lyrics for each track of a release from Genius and store
 * them. Previously-fetched Genius lyrics are replaced; manually entered lyrics
 * are left untouched. Never throws for a single missing song.
 */
export async function processLyrics(releaseId: string): Promise<void> {
  if (!genius.hasAuth()) return;

  const release = await prisma.release.findUnique({
    where: { id: releaseId },
    include: { tracks: { orderBy: { trackIndex: 'asc' } } },
  });
  if (!release) return;

  const tracks = release.tracks
    .filter((t) => t.type === 'track' && t.title.trim().length > 0)
    .slice(0, MAX_TRACKS);
  if (tracks.length === 0) return;

  // Replace only Genius-sourced lyrics so re-runs don't pile up duplicates.
  await prisma.lyrics.deleteMany({ where: { releaseId, source: 'GENIUS' } });

  for (const track of tracks) {
    try {
      const found = await genius.getLyrics(release.artistDisplay, track.title);
      if (found) {
        await prisma.lyrics.create({
          data: {
            releaseId,
            trackId: track.id,
            text: found.text,
            source: 'GENIUS',
            sourceUrl: found.url,
          },
        });
      }
    } catch {
      // ignore a single track failure
    }
    await sleep(GAP_MS);
  }
}
