// Parse a timestamped LRC string (from LRCLIB) into time-ordered lines.
// Lines look like "[01:23.45] some words" — a line can carry several stamps.
// Blank lines (musical breaks) are kept so the highlight pauses there too.
export interface LrcLine {
  timeMs: number;
  text: string;
}

const STAMP = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

export function parseLrc(lrc: string): LrcLine[] {
  const out: LrcLine[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    STAMP.lastIndex = 0;
    const stamps: number[] = [];
    let m: RegExpExecArray | null;
    while ((m = STAMP.exec(raw))) {
      const min = parseInt(m[1], 10);
      const sec = parseInt(m[2], 10);
      const frac = m[3] ? parseInt(m[3].padEnd(3, '0').slice(0, 3), 10) : 0;
      stamps.push(min * 60_000 + sec * 1000 + frac);
    }
    if (stamps.length === 0) continue;
    const text = raw.replace(STAMP, '').trim();
    for (const t of stamps) out.push({ timeMs: t, text });
  }
  out.sort((a, b) => a.timeMs - b.timeMs);
  return out;
}

/** Index of the line that should be highlighted at `ms`, or -1 before the first. */
export function activeLineIndex(lines: LrcLine[], ms: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].timeMs <= ms) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}
