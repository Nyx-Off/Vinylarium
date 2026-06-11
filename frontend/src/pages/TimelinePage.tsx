import { useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTimeline } from '../api/hooks';
import { TimelineRelease } from '../api/types';
import { Cover } from '../components/Cover';
import { Spinner } from '../components/Spinner';

const HALF = 320; // half the strip height — the path wanders inside ±amp
const GAP = 64; // breathing room between two year clouds
const BREAK_EXTRA = 80; // extra room when a long silent gap is collapsed

type PlacedCover = {
  release: TimelineRelease;
  px: number; // offset of the cover CENTER from the year point
  py: number;
  j: Jitter;
};

type YearNode = {
  year: number;
  isDecade: boolean;
  x: number;
  y: number;
  rx: number; // horizontal half-extent of the cover cloud (incl. covers)
  ry: number;
  covers: PlacedCover[];
  breakBefore: boolean; // >4 silent years before this node → dashed segment + "···"
};

type Jitter = ReturnType<typeof jitter>;

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
    da: (f(0, 97) - 0.5) * 0.35, // rad, angular wobble on the ring
    dr: (f(7, 89) - 0.5) * 0.16, // relative radial wobble
    rot: (f(13, 83) - 0.5) * 14, // degrees
    size: 60 + f(19, 79) * 26, // px, 60..86
    dur: 4 + f(23, 73) * 3.5, // s, bobbing speed
    delay: -f(27, 71) * 6, // s, negative = start mid-swing
  };
}

/** Same FNV-style hash for a year number, as a 0..1 fraction. */
function yearFrac(year: number, salt: number) {
  let h = Math.imul(year ^ (salt * 0x9e3779b9), 2654435761) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 16777619) >>> 0;
  return (h % 1000) / 999;
}

/**
 * Scatter a year's covers on elliptical rings around its point. Ring r holds
 * 6 + 6r covers; rings are wider than tall so even a crowded year stays inside
 * the strip. Angles are evenly spread per ring, then nudged by each release's
 * own jitter so nothing looks gridded.
 */
function placeCovers(releases: TimelineRelease[], year: number): {
  covers: PlacedCover[];
  rx: number;
  ry: number;
} {
  const covers: PlacedCover[] = [];
  let i = 0;
  let ring = 0;
  let rx = 0;
  let ry = 0;
  while (i < releases.length) {
    const cap = 6 + ring * 6;
    const count = Math.min(cap, releases.length - i);
    const ringRx = 112 + ring * 84;
    const ringRy = Math.min(86 + ring * 52, HALF - 100);
    const offset = yearFrac(year, ring + 1) * Math.PI * 2;
    for (let k = 0; k < count; k++, i++) {
      const j = jitter(releases[i].id);
      const angle = offset + (k / count) * Math.PI * 2 + j.da;
      const radial = 1 + j.dr;
      covers.push({
        release: releases[i],
        px: Math.cos(angle) * ringRx * radial,
        py: Math.sin(angle) * ringRy * radial,
        j,
      });
    }
    rx = ringRx * 1.08;
    ry = ringRy * 1.08;
    ring++;
  }
  // half-extents including the covers themselves (worst-case size 86 → half 43)
  return { covers, rx: rx + 46, ry: ry + 46 };
}

/**
 * One point per year, oldest to newest. The points are deliberately NOT
 * aligned: each wanders up or down (deterministically, from the year hash and
 * a slow sine on its rank) as far as its cover cloud allows. Long silent gaps
 * (>4 years) collapse into a dashed leg of the path with a "···".
 */
function buildNodes(releases: TimelineRelease[]) {
  const byYear = new Map<number, TimelineRelease[]>();
  for (const r of releases) {
    const bucket = byYear.get(r.year);
    if (bucket) bucket.push(r);
    else byYear.set(r.year, [r]);
  }
  const years = [...byYear.keys()].sort((a, b) => a - b);
  const nodes: YearNode[] = [];
  let x = 24;
  for (let i = 0; i < years.length; i++) {
    const year = years[i];
    const { covers, rx, ry } = placeCovers(byYear.get(year)!, year);
    const gap = i > 0 ? year - years[i - 1] - 1 : 0;
    const breakBefore = gap > 4;
    if (i > 0) {
      x += nodes[i - 1].rx + GAP + Math.min(gap * 10, 50) + (breakBefore ? BREAK_EXTRA : 0) + rx;
    } else {
      x += rx;
    }
    const amp = Math.max(0, HALF - ry - 14);
    const wave = Math.sin(i * 1.15 + yearFrac(year, 7) * 1.4) * 0.7 + (yearFrac(year, 3) - 0.5) * 0.9;
    const y = HALF + Math.max(-1, Math.min(1, wave)) * amp;
    nodes.push({ year, isDecade: year % 10 === 0, x, y, rx, ry, covers, breakBefore });
  }
  const total = nodes.length > 0 ? nodes[nodes.length - 1].x + nodes[nodes.length - 1].rx + 48 : 0;
  return { nodes, total };
}

/** Catmull-Rom control points for the leg p1→p2 of the journey. */
function legPath(nodes: YearNode[], i: number) {
  const p0 = nodes[i - 1] ?? nodes[i];
  const p1 = nodes[i];
  const p2 = nodes[i + 1];
  const p3 = nodes[i + 2] ?? p2;
  const c1x = p1.x + (p2.x - p0.x) / 6;
  const c1y = p1.y + (p2.y - p0.y) / 6;
  const c2x = p2.x - (p3.x - p1.x) / 6;
  const c2y = p2.y - (p3.y - p1.y) / 6;
  return `M ${p1.x} ${p1.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
}

export default function TimelinePage() {
  const { data, isLoading } = useTimeline();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);

  const built = useMemo(
    () => (data && data.releases.length > 0 ? buildNodes(data.releases) : null),
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
    const seen = new Map<number, number>(); // decade → x of its first year node
    for (const n of built.nodes) {
      const d = Math.floor(n.year / 10) * 10;
      if (!seen.has(d)) seen.set(d, Math.max(0, n.x - n.rx - 24));
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

  const { nodes, total } = built;
  const stripHeight = HALF * 2;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-bold">Frise chronologique</h1>
        <div className="no-scrollbar flex max-w-full gap-1.5 overflow-x-auto">
          {decades.map((d) => (
            <button
              key={d.decade}
              onClick={() => scrollerRef.current?.scrollTo({ left: d.x, behavior: 'smooth' })}
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
        <div className="relative select-none" style={{ width: total, height: stripHeight }}>
          {/* The journey: a smooth curve from point to point, dashed across
              collapsed silent gaps, with a halo dot at each year. */}
          <svg
            className="pointer-events-none absolute inset-0"
            width={total}
            height={stripHeight}
            viewBox={`0 0 ${total} ${stripHeight}`}
            fill="none"
          >
            {nodes.slice(0, -1).map((n, i) => (
              <path
                key={`leg-${n.year}`}
                d={legPath(nodes, i)}
                className="stroke-mocha/40"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeDasharray={nodes[i + 1].breakBefore ? '2 10' : undefined}
              />
            ))}
            {nodes.map((n, i) =>
              n.breakBefore && i > 0 ? (
                <text
                  key={`gap-${n.year}`}
                  x={(nodes[i - 1].x + n.x) / 2}
                  y={(nodes[i - 1].y + n.y) / 2 - 12}
                  textAnchor="middle"
                  className="fill-mocha/60 text-sm tracking-[0.3em]"
                >
                  ···
                </text>
              ) : null,
            )}
            {nodes.map((n) => (
              <g key={`dot-${n.year}`}>
                <circle cx={n.x} cy={n.y} r={n.isDecade ? 13 : 10} className="fill-accent/20" />
                <circle cx={n.x} cy={n.y} r={n.isDecade ? 6 : 4.5} className="fill-accent" />
              </g>
            ))}
          </svg>

          {nodes.map((node) => (
            <div key={node.year}>
              {/* Year label hanging just under its point */}
              <span
                className={`absolute z-10 -translate-x-1/2 rounded-full px-2 py-0.5 ${
                  node.isDecade
                    ? 'bg-accent font-display text-sm font-bold text-cream shadow'
                    : 'bg-cream text-[11px] font-semibold text-mocha ring-1 ring-mocha/30'
                }`}
                style={{ left: node.x, top: node.y + 16 }}
              >
                {node.year}
              </span>
              {node.covers.map(({ release: r, px, py, j }) => (
                <div
                  key={r.id}
                  className="animate-tl-float absolute hover:z-20 hover:[animation-play-state:paused]"
                  style={{
                    left: node.x + px - j.size / 2,
                    top: node.y + py - j.size / 2,
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
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
