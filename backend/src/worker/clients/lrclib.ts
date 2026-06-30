import { fetchWithTimeout } from '../../lib/http';

/**
 * LRCLIB (lrclib.net) — a free, keyless community lyrics database used as a
 * COMPLEMENT to Genius: it matches on artist + track + album + duration and
 * often has songs Genius lacks (and vice-versa). Best-effort, plain text only
 * (synced lyrics are flattened). No auth; we just send a descriptive UA and only
 * call it for tracks Genius missed, so traffic stays light.
 */

const UA = 'Vinylarium (+https://github.com/Nyx-Off/Vinylarium)';

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const stripParens = (s: string) => s.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
const overlaps = (a: string, b: string) => a.length > 0 && b.length > 0 && (a.includes(b) || b.includes(a));

interface LrcRecord {
  id?: number;
  trackName?: string;
  artistName?: string;
  albumName?: string;
  duration?: number;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
  instrumental?: boolean;
}

/** Plain text from a record (flattening synced [mm:ss.xx] lyrics if needed). */
function plainFrom(rec: LrcRecord): string | null {
  if (rec.instrumental) return null;
  if (rec.plainLyrics && rec.plainLyrics.trim()) return rec.plainLyrics.trim();
  if (rec.syncedLyrics && rec.syncedLyrics.trim()) {
    const txt = rec.syncedLyrics
      .replace(/\[\d+:\d+(?:\.\d+)?\]/g, '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .join('\n');
    return txt.length > 0 ? txt : null;
  }
  return null;
}

function titleOk(wantTitle: string, wantBase: string, rec: LrcRecord): boolean {
  const t = normalize(rec.trackName ?? '');
  if (t === wantTitle) return true;
  const base = normalize(stripParens(rec.trackName ?? ''));
  if (wantBase.length >= 4 && base === wantBase) return true;
  return overlaps(wantTitle, t) || (wantBase.length >= 5 && overlaps(wantBase, base));
}

function artistOk(wantArtist: string, rec: LrcRecord): boolean {
  const a = normalize(rec.artistName ?? '');
  if (a === wantArtist || overlaps(wantArtist, a)) return true;
  return wantArtist.split(' ').some((w) => w.length >= 3 && a.includes(w));
}

async function apiGet(path: string): Promise<any | null> {
  const res = await fetchWithTimeout(`https://lrclib.net${path}`, { headers: { 'User-Agent': UA } }, 12_000);
  if (!res.ok) return null;
  return res.json();
}

export const lrclib = {
  /**
   * Find plain lyrics for a track, validated on artist + title (so a loose
   * search hit can't bring in the wrong song). Prefers the closest duration.
   */
  async getLyrics(opts: {
    artist: string;
    title: string;
    album?: string | null;
    durationSec?: number | null;
  }): Promise<{ text: string; url: string; synced: string | null } | null> {
    const artist = opts.artist?.trim();
    const title = opts.title?.trim();
    if (!artist || !title) return null;
    const wantTitle = normalize(title);
    const wantBase = normalize(stripParens(title));
    const wantArtist = normalize(artist);

    const pick = (recs: LrcRecord[]): { text: string; url: string; synced: string | null } | null => {
      const valid = recs.filter((r) => artistOk(wantArtist, r) && titleOk(wantTitle, wantBase, r));
      if (valid.length === 0) return null;
      const dur = opts.durationSec ?? null;
      valid.sort((a, b) => {
        const da = dur && a.duration ? Math.abs(a.duration - dur) : 999;
        const db = dur && b.duration ? Math.abs(b.duration - dur) : 999;
        return da - db;
      });
      for (const r of valid) {
        const text = plainFrom(r);
        if (text)
          return {
            text,
            // Raw timestamped LRC, kept so the UI can sync lines to playback.
            synced: r.syncedLyrics && r.syncedLyrics.trim() ? r.syncedLyrics.trim() : null,
            url: r.id ? `https://lrclib.net/api/get/${r.id}` : 'https://lrclib.net',
          };
      }
      return null;
    };

    // 1) Precise signature match when a duration is known.
    if (opts.durationSec) {
      const q = new URLSearchParams({ artist_name: artist, track_name: title, duration: String(opts.durationSec) });
      if (opts.album) q.set('album_name', opts.album);
      const rec = await apiGet(`/api/get?${q.toString()}`);
      if (rec) {
        const got = pick([rec]);
        if (got) return got;
      }
    }
    // 2) Looser search fallback.
    const sq = new URLSearchParams({ artist_name: artist, track_name: title });
    const arr = await apiGet(`/api/search?${sq.toString()}`);
    return Array.isArray(arr) ? pick(arr) : null;
  },
};
