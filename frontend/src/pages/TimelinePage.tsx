import { useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTimeline } from '../api/hooks';
import { TimelineRelease } from '../api/types';
import { Cover } from '../components/Cover';
import { Spinner } from '../components/Spinner';

const SLOT = 96; // vertical room per floating level
const LEVELS = 3; // levels of covers on EACH side of the axis
const SEG_PAD = 10; // inner padding of a year segment
const EMPTY_W = 22; // width of a year without releases
const BREAK_W = 72; // collapsed long gap ("···")

type Segment =
  | { kind: 'year'; year: number; releases: TimelineRelease[]; x: number; width: number }
  | { kind: 'empty'; year: number; x: number; width: number }
  | { kind: 'break'; x: number; width: number };

/**
 * One segment per year from the oldest to the newest release. Covers float on
 * BOTH sides of the axis (LEVELS each), so a year fits 2×LEVELS covers per
 * column; runs of more than four silent years collapse into a single "···"
 * break so a lone 1958 record doesn't push the seventies off-screen.
 */
function buildSegments(releases: TimelineRelease[]) {
  const byYear = new Map<number, TimelineRelease[]>();
  for (const r of releases) {
    const bucket = byYear.get(r.year);
    if (bucket) bucket.push(r);
    else byYear.set(r.year, [r]);
  }
  const years = [...byYear.keys()].sort((a, b) => a - b);
  const perColumn = LEVELS * 2;
  const segments: Segment[] = [];
  let x = 0;
  for (let i = 0; i < years.length; i++) {
    const year = years[i];
    if (i > 0) {
      const gap = year - years[i - 1] - 1;
      if (gap > 4) {
        segments.push({ kind: 'break', x, width: BREAK_W });
        x += BREAK_W;
      } else {
        for (let y = years[i - 1] + 1; y < year; y++) {
          segments.push({ kind: 'empty', year: y, x, width: EMPTY_W });
          x += EMPTY_W;
        }
      }
    }
    const list = byYear.get(year)!;
    const cols = Math.ceil(list.length / perColumn);
    const width = cols * SLOT + SEG_PAD * 2;
    segments.push({ kind: 'year', year, releases: list, x, width });
    x += width;
  }
  return { segments, total: x };
}

/** Deterministic per-release jitter so the cloud doesn't reshuffle on render. */
function jitter(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h >>>= 0;
  const f = (shift: number, mod: number) => ((h >>> shift) % mod) / (mod - 1); // 0..1
  return {
    dx: (f(0, 97) - 0.5) * 18, // px
    dy: (f(7, 89) - 0.5) * 22, // px
    rot: (f(13, 83) - 0.5) * 12, // degrees
    size: 64 + f(19, 79) * 24, // px, 64..88
    dur: 4 + f(23, 73) * 3.5, // s, bobbing speed
    delay: -f(27, 71) * 6, // s, negative = start mid-swing
  };
}

export default function TimelinePage() {
  const { data, isLoading } = useTimeline();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);

  const built = useMemo(
    () => (data && data.releases.length > 0 ? buildSegments(data.releases) : null),
    [data],
  );

  // Vertical wheel → horizontal travel (the strip is the only thing to scroll
  // here); needs a native non-passive listener to be allowed to preventDefault.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return; // trackpad pans natively
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [built]);

  const decades = useMemo(() => {
    if (!built) return [];
    const seen = new Map<number, number>(); // decade → x of its first year segment
    for (const s of built.segments) {
      if (s.kind !== 'year') continue;
      const d = Math.floor(s.year / 10) * 10;
      if (!seen.has(d)) seen.set(d, s.x);
    }
    return [...seen.entries()].map(([decade, x]) => ({ decade, x }));
  }, [built]);

  if (isLoading) return <Spinner />;

  if (!built) {
    return (
      <div>
        <h1 className="font-display text-3xl font-bold">Frise chronologique</h1>
        <p className="mt-4 text-mocha">
          Aucun disque daté pour l'instant — importez et enrichissez votre collection.
        </p>
      </div>
    );
  }

  const { segments, total } = built;
  const half = LEVELS * SLOT + 28; // floating space on each side of the axis
  const stripHeight = half * 2;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-bold">Frise chronologique</h1>
        <div className="no-scrollbar flex max-w-full gap-1.5 overflow-x-auto">
          {decades.map((d) => (
            <button
              key={d.decade}
              onClick={() =>
                scrollerRef.current?.scrollTo({ left: Math.max(0, d.x - 48), behavior: 'smooth' })
              }
              className="chip hover:bg-ink/10"
            >
              {d.decade}s
            </button>
          ))}
        </div>
      </div>
      <p className="mb-2 mt-1 text-sm text-mocha">
        {data!.releases.length} disques du plus ancien au plus récent (année de l'édition Discogs)
        — molette ou glissement pour voyager dans le temps.
        {data!.undated > 0 && (
          <span className="text-mocha/70">
            {' '}
            {data!.undated} disque{data!.undated > 1 ? 's' : ''} sans année n'apparaî
            {data!.undated > 1 ? 'ssent' : 't'} pas ici.
          </span>
        )}
      </p>

      <div
        ref={scrollerRef}
        className="no-scrollbar -mx-4 cursor-grab overflow-x-auto overflow-y-hidden px-4 active:cursor-grabbing"
        onPointerDown={(e) => {
          if (e.pointerType !== 'mouse' || e.button !== 0) return;
          drag.current = { x: e.clientX, left: scrollerRef.current!.scrollLeft, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          if (e.buttons === 0) {
            // button released outside the strip — we never got the pointerup
            drag.current = null;
            return;
          }
          const dx = e.clientX - d.x;
          if (Math.abs(dx) > 5) d.moved = true;
          if (d.moved) scrollerRef.current!.scrollLeft = d.left - dx;
        }}
        onPointerUp={() => {
          // Let the click-capture below read `moved` before clearing it.
          setTimeout(() => (drag.current = null), 0);
        }}
        onClickCapture={(e) => {
          if (drag.current?.moved) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        <div className="relative select-none" style={{ width: total + 48, height: stripHeight }}>
          {/* The axis, vertically centered — covers float on both sides. */}
          <div
            className="absolute left-0 h-[3px] -translate-y-1/2 rounded bg-gradient-to-r from-mocha/30 via-accent/60 to-mocha/30"
            style={{ top: half, width: total + 48 }}
          />

          {segments.map((seg) => {
            if (seg.kind === 'break') {
              return (
                <span
                  key={`b${seg.x}`}
                  className="absolute -translate-y-1/2 text-center text-lg tracking-[0.4em] text-mocha/50"
                  style={{ left: seg.x + 24, width: seg.width, top: half - 2 }}
                >
                  ···
                </span>
              );
            }
            if (seg.kind === 'empty') {
              const isDecade = seg.year % 10 === 0;
              return (
                <span
                  key={seg.year}
                  className={`absolute -translate-y-1/2 ${
                    isDecade ? 'h-3 w-[2.5px] bg-accent/70' : 'h-1.5 w-px bg-mocha/40'
                  }`}
                  style={{ left: seg.x + 24 + seg.width / 2, top: half }}
                />
              );
            }
            const isDecade = seg.year % 10 === 0;
            return (
              <div key={seg.year}>
                {/* Year badge sitting ON the line */}
                <span
                  className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full px-2 py-0.5 ${
                    isDecade
                      ? 'bg-accent font-display text-sm font-bold text-cream shadow'
                      : 'bg-cream text-[11px] font-semibold text-mocha ring-1 ring-mocha/30'
                  }`}
                  style={{ left: seg.x + 24 + seg.width / 2, top: half }}
                >
                  {seg.year}
                </span>
                {seg.releases.map((r, i) => {
                  const j = jitter(r.id);
                  const perColumn = LEVELS * 2;
                  const col = Math.floor(i / perColumn);
                  const slot = i % perColumn;
                  const side = slot % 2 === 0 ? -1 : 1; // above / below
                  const level = Math.floor(slot / 2); // 0 = nearest the axis
                  const y = half + side * (34 + level * SLOT + (SLOT - 8 - j.size) / 2) + j.dy;
                  return (
                    <div
                      key={r.id}
                      className="animate-tl-float absolute hover:z-20 hover:[animation-play-state:paused]"
                      style={{
                        left: seg.x + 24 + SEG_PAD + col * SLOT + (SLOT - 10 - j.size) / 2 + j.dx,
                        top: side < 0 ? y - j.size : y,
                        animationDuration: `${j.dur}s`,
                        animationDelay: `${j.delay}s`,
                      }}
                    >
                      {/* rotation lives on its own layer: the float animation
                          owns the outer transform, hover-scale the inner one */}
                      <div style={{ transform: `rotate(${j.rot}deg)` }}>
                        <Link
                          to={`/release/${r.id}`}
                          title={`${r.artist} — ${r.title} (${r.year})`}
                          className="block overflow-hidden rounded-md shadow-lg ring-1 ring-ink/15 transition-transform duration-150 hover:scale-110"
                          style={{ width: j.size, height: j.size }}
                          draggable={false}
                        >
                          <Cover src={r.coverUrl} title={r.title} artist={r.artist} />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
