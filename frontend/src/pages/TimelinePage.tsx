import { useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTimeline } from '../api/hooks';
import { TimelineRelease } from '../api/types';
import { Cover } from '../components/Cover';
import { Spinner } from '../components/Spinner';

const COVER = 76; // cover side, px
const SLOT = COVER + 8; // cover + gap
const MAX_ROWS = 6; // covers stacked per column before opening a new one
const SEG_PAD = 8; // inner padding of a year segment
const EMPTY_W = 22; // width of a year without releases
const BREAK_W = 64; // collapsed long gap ("···")
const AXIS_ZONE = 56; // space under the axis for ticks + year labels

type Segment =
  | { kind: 'year'; year: number; releases: TimelineRelease[]; x: number; width: number }
  | { kind: 'empty'; year: number; x: number; width: number }
  | { kind: 'break'; x: number; width: number };

/**
 * One segment per year from the oldest to the newest release. Years with
 * records get one column of stacked covers per MAX_ROWS; runs of more than
 * four silent years collapse into a single "···" break so a lone 1958 record
 * doesn't push the seventies off-screen.
 */
function buildSegments(releases: TimelineRelease[]) {
  const byYear = new Map<number, TimelineRelease[]>();
  for (const r of releases) {
    const bucket = byYear.get(r.year);
    if (bucket) bucket.push(r);
    else byYear.set(r.year, [r]);
  }
  const years = [...byYear.keys()].sort((a, b) => a - b);
  const segments: Segment[] = [];
  let x = 0;
  let maxCount = 0;
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
    maxCount = Math.max(maxCount, list.length);
    const cols = Math.ceil(list.length / MAX_ROWS);
    const width = cols * SLOT + SEG_PAD * 2;
    segments.push({ kind: 'year', year, releases: list, x, width });
    x += width;
  }
  const rows = Math.min(MAX_ROWS, Math.max(2, maxCount));
  return { segments, total: x, rows };
}

function YearLabel({ year, strong }: { year: number; strong: boolean }) {
  return (
    <span
      className={
        strong
          ? 'font-display text-sm font-bold text-ink'
          : 'text-[11px] font-medium text-mocha/80'
      }
    >
      {year}
    </span>
  );
}

export default function TimelinePage() {
  const { data, isLoading } = useTimeline();
  const scrollerRef = useRef<HTMLDivElement>(null);

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

  const { segments, total, rows } = built;
  const stripHeight = rows * SLOT + AXIS_ZONE + 12;
  const axisBottom = AXIS_ZONE; // y of the axis line, from the bottom

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
      <p className="mb-4 mt-1 text-sm text-mocha">
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

      <div ref={scrollerRef} className="card overflow-x-auto overflow-y-hidden">
        <div className="relative" style={{ width: total + 48, height: stripHeight }}>
          {/* The axis */}
          <div
            className="absolute left-0 h-[3px] rounded bg-gradient-to-r from-mocha/40 via-accent/70 to-mocha/40"
            style={{ bottom: axisBottom, width: total + 48 }}
          />

          {segments.map((seg) => {
            if (seg.kind === 'break') {
              return (
                <div
                  key={`b${seg.x}`}
                  className="absolute flex items-center justify-center text-lg tracking-[0.4em] text-mocha/50"
                  style={{ left: seg.x + 24, width: seg.width, bottom: axisBottom - 11 }}
                >
                  ···
                </div>
              );
            }
            const isDecade = seg.year % 10 === 0;
            const tick = (
              <div
                className="absolute flex flex-col items-center"
                style={{ left: seg.x + 24, width: seg.width, bottom: axisBottom - (isDecade ? 38 : 28) }}
              >
                <span
                  className={isDecade ? 'h-3.5 w-[2.5px] bg-accent/80' : 'h-2 w-px bg-mocha/50'}
                />
                {(seg.kind === 'year' || isDecade) && (
                  <YearLabel year={seg.year} strong={isDecade} />
                )}
              </div>
            );
            if (seg.kind === 'empty') return <div key={seg.year}>{tick}</div>;
            return (
              <div key={seg.year}>
                {tick}
                {seg.releases.map((r, i) => {
                  const col = Math.floor(i / rows);
                  const row = i % rows;
                  return (
                    <Link
                      key={r.id}
                      to={`/release/${r.id}`}
                      title={`${r.artist} — ${r.title} (${r.year})`}
                      className="absolute overflow-hidden rounded-md shadow-md ring-1 ring-ink/15 transition-transform duration-150 hover:z-10 hover:scale-110 hover:shadow-lg"
                      style={{
                        left: seg.x + 24 + SEG_PAD + col * SLOT,
                        bottom: axisBottom + 10 + row * SLOT,
                        width: COVER,
                        height: COVER,
                      }}
                    >
                      <Cover src={r.coverUrl} title={r.title} artist={r.artist} />
                    </Link>
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
