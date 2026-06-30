import { prisma } from '../../db/prisma';
import { isPlaceholderArtist } from '../../lib/text';
import { genius, GeniusRateLimitError } from '../clients/genius';
import { lrclib } from '../clients/lrclib';
import { processAlbumAnecdote } from './anecdote';

const MAX_TRACKS = 40;
const GAP_MS = 750; // be polite between Genius requests

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Best-effort: fetch lyrics for each track of a release from Genius and store
 * them. Previously-fetched Genius lyrics are replaced; manually entered lyrics
 * are left untouched. Never throws for a single missing song — but a Genius
 * 429 aborts the whole job BEFORE anything is deleted, so the existing lyrics
 * survive and BullMQ retries once the rate-limit window has passed.
 */
export async function processLyrics(releaseId: string): Promise<void> {
  if (!genius.hasAuth()) return;

  const release = await prisma.release.findUnique({
    where: { id: releaseId },
    include: { tracks: { orderBy: { trackIndex: 'asc' } } },
  });
  if (!release) return;

  // Album description ("anecdote") rides along with the lyrics pass. It is
  // best-effort too, except a rate limit which must fail the job as a whole.
  await processAlbumAnecdote(releaseId).catch((e) => {
    if (e instanceof GeniusRateLimitError) throw e;
  });

  // From here on the pass is considered done once it completes — date it so
  // "re-enrich missing only" knows this release doesn't need another visit.
  const markDone = () =>
    prisma.release.update({ where: { id: releaseId }, data: { lyricsFetchedAt: new Date() } });

  const tracks = release.tracks
    .filter((t) => t.type === 'track' && t.title.trim().length > 0)
    .slice(0, MAX_TRACKS);
  if (tracks.length === 0) {
    await markDone();
    return;
  }

  // Collect everything first, then replace in one transaction: the old rows
  // must never be deleted on the strength of a fetch that produced nothing.
  const found: {
    trackId: string;
    text: string;
    url: string;
    source: 'GENIUS' | 'LRCLIB';
    synced?: string | null;
  }[] = [];
  for (const track of tracks) {
    try {
      // Compilations bill the release as "Various"; the per-track artist (when
      // Discogs provides one) is the real one to search with.
      const trackArtist = track.artistDisplay?.trim() || release.artistDisplay;
      // Without a real artist, search matches a literal "Various"/"Unknown
      // Artist" page and returns junk — skip (no request, no delay needed).
      if (isPlaceholderArtist(trackArtist)) continue;
      const hit = await genius.getLyrics(trackArtist, track.title, release.title);
      if (hit) {
        found.push({ trackId: track.id, text: hit.text, url: hit.url, source: 'GENIUS' });
      } else {
        // LRCLIB complements Genius: matched on artist+title+album+duration, it
        // often has songs Genius lacks. Best-effort; failures are ignored.
        const lrc = await lrclib
          .getLyrics({
            artist: trackArtist,
            title: track.title,
            album: release.title,
            durationSec: track.durationSec,
          })
          .catch(() => null);
        if (lrc)
          found.push({
            trackId: track.id,
            text: lrc.text,
            url: lrc.url,
            source: 'LRCLIB',
            synced: lrc.synced,
          });
      }
    } catch (e) {
      if (e instanceof GeniusRateLimitError) throw e;
      // ignore a single track failure
    }
    await sleep(GAP_MS);
  }

  // Replace auto-sourced lyrics (Genius + LRCLIB) so re-runs don't pile up
  // duplicates; manually entered lyrics are left untouched.
  await prisma.$transaction([
    prisma.lyrics.deleteMany({ where: { releaseId, source: { in: ['GENIUS', 'LRCLIB'] } } }),
    ...found.map((f) =>
      prisma.lyrics.create({
        data: {
          releaseId,
          trackId: f.trackId,
          text: f.text,
          synced: f.synced ?? null,
          source: f.source,
          sourceUrl: f.url,
        },
      }),
    ),
  ]);
  await markDone();
}
