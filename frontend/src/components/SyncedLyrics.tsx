import { useEffect, useMemo, useRef, useState } from 'react';
import { activeLineIndex, parseLrc } from '../lib/lrc';

/**
 * Timestamped lyrics that follow Spotify playback. `progressMs` comes from the
 * now-playing poll (every few seconds); between polls we advance a local clock
 * so the highlight stays smooth, and re-sync whenever a fresh progress arrives.
 * When `active` is false (this track isn't the one playing) the lines render
 * statically with no highlight.
 */
export function SyncedLyrics({
  lrc,
  active,
  playing,
  progressMs,
}: {
  lrc: string;
  active: boolean;
  playing: boolean;
  progressMs: number;
}) {
  const lines = useMemo(() => parseLrc(lrc), [lrc]);
  const [elapsed, setElapsed] = useState(0);
  const base = useRef({ progressMs: 0, at: 0 });
  const activeRef = useRef<HTMLParagraphElement | null>(null);

  // Re-anchor the local clock on every fresh now-playing reading.
  useEffect(() => {
    base.current = { progressMs, at: performance.now() };
    setElapsed(progressMs);
  }, [progressMs, active]);

  // Tick the local clock while this track is actually playing.
  useEffect(() => {
    if (!active || !playing) return;
    const id = setInterval(() => {
      setElapsed(base.current.progressMs + (performance.now() - base.current.at));
    }, 250);
    return () => clearInterval(id);
  }, [active, playing]);

  const idx = active ? activeLineIndex(lines, elapsed) : -1;

  // Keep the highlighted line in view (within this scroll box only).
  useEffect(() => {
    if (idx >= 0) activeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [idx]);

  if (lines.length === 0) return null;

  return (
    <div className="mt-2 max-h-72 overflow-y-auto pr-1">
      {lines.map((l, i) => (
        <p
          key={i}
          ref={i === idx ? activeRef : undefined}
          className={
            'py-0.5 text-sm transition-colors ' +
            (i === idx
              ? 'font-semibold text-accent'
              : active && i < idx
                ? 'text-mocha/50'
                : 'text-mocha')
          }
        >
          {l.text || '♪'}
        </p>
      ))}
    </div>
  );
}
