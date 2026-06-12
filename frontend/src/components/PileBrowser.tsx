import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cover } from './Cover';
import { ReleaseListItem } from '../api/types';

/**
 * "Piles" view: the collection as messy stacks of sleeves, one pile per
 * artist, laid on a table seen from above with a slight backward tilt.
 * Scrolling the wheel over a pile explodes it into a spiral fan (scroll up
 * restacks); on touch / click, tapping a stacked pile explodes it and the
 * artist label restacks. Every rotation/offset is hashed from the release id
 * so piles keep their exact mess between renders.
 *
 * Pile ORDER follows the items order (first appearance of each artist), so
 * the library sort select drives it: artist A→Z/Z→A, year, recently added…
 * `filter` narrows piles by ARTIST name (accent-insensitive), client-side.
 */

const CELL = 250; // px, pile cell square — generous so the page breathes
const SLEEVE = 152; // px, cover size

/** Deterministic 0..1 from a string (FNV-1a). */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

interface Sleeve {
  r: ReleaseListItem;
  stackX: number; // messy offsets in the pile
  stackY: number;
  stackRot: number; // degrees, every which way
  fanX: number; // exploded (spiral fan) position
  fanY: number;
  fanRot: number; // almost straight once exploded
}

interface Pile {
  artist: string;
  sleeves: Sleeve[];
}

/** Spiral-fan position for sleeve i — rings of 7, 13, 19… */
function fanPosition(i: number): { x: number; y: number } {
  if (i === 0) return { x: 0, y: 0 };
  let ring = 1;
  let first = 1;
  let capacity = 7;
  while (i >= first + capacity) {
    first += capacity;
    ring++;
    capacity += 6;
  }
  const idx = i - first;
  const angle = (idx / capacity) * Math.PI * 2 + ring * 0.7;
  const radius = ring * (SLEEVE * 0.92);
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

/** Group by artist, PRESERVING the incoming order (Map insertion order). */
function buildPiles(items: ReleaseListItem[]): Pile[] {
  const byArtist = new Map<string, ReleaseListItem[]>();
  for (const r of items) {
    const key = r.artistDisplay || '???';
    const arr = byArtist.get(key);
    if (arr) arr.push(r);
    else byArtist.set(key, [r]);
  }
  return [...byArtist.entries()].map(([artist, releases]) => ({
    artist,
    sleeves: releases
      .slice()
      .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999))
      .map((r, i) => {
        const fan = fanPosition(i);
        return {
          r,
          stackX: (hash01(r.id + 'x') - 0.5) * 26,
          stackY: (hash01(r.id + 'y') - 0.5) * 26,
          stackRot: (hash01(r.id + 'r') - 0.5) * 50, // ±25° — every which way
          fanX: fan.x,
          fanY: fan.y,
          fanRot: (hash01(r.id + 'r') - 0.5) * 8, // nearly straightened
        };
      }),
  }));
}

export function PileBrowser({ items, filter = '' }: { items: ReleaseListItem[]; filter?: string }) {
  const navigate = useNavigate();
  const allPiles = useMemo(() => buildPiles(items), [items]);
  const piles = useMemo(() => {
    const f = fold(filter.trim());
    return f ? allPiles.filter((p) => fold(p.artist).includes(f)) : allPiles;
  }, [allPiles, filter]);

  // Explosion factor per artist, 0 (stacked) → 1 (fully fanned out). The ref
  // mirrors the state so the wheel handler can decide preventDefault
  // SYNCHRONOUSLY — deciding it inside the setState updater fires too late
  // and the page scrolls along with the explosion.
  const [spread, setSpread] = useState<Record<string, number>>({});
  const spreadRef = useRef(spread);
  spreadRef.current = spread;
  const gridRef = useRef<HTMLDivElement>(null);

  // ONE delegated, non-passive wheel listener (same pattern as CrateBrowser):
  // scrolling over a pile explodes/restacks it INSTEAD of scrolling the page;
  // the page only scrolls through a pile once the gesture has nothing left to
  // change (fully stacked + scroll up, or fully fanned + scroll down).
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const cell = (e.target as HTMLElement).closest<HTMLElement>('[data-pile]');
      if (!cell) return;
      const artist = cell.dataset.pile!;
      const cur = spreadRef.current[artist] ?? 0;
      const next = Math.min(1, Math.max(0, cur + e.deltaY * 0.0016));
      if (next === cur) return; // nothing to change → let the page scroll
      e.preventDefault();
      spreadRef.current = { ...spreadRef.current, [artist]: next };
      setSpread(spreadRef.current);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  if (piles.length === 0) {
    return <p className="py-16 text-center text-mocha">Aucun artiste ne correspond à « {filter} ».</p>;
  }

  return (
    <div
      ref={gridRef}
      className="grid justify-center gap-x-12 gap-y-20 pb-28 pt-10"
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${CELL + 40}px, 1fr))` }}
    >
      {piles.map((pile) => {
        const t = spread[pile.artist] ?? 0;
        const exploded = t > 0.45;
        return (
          <div
            key={pile.artist}
            data-pile={pile.artist}
            className="relative flex flex-col items-center"
            // An exploding pile overflows its neighbours: float it above them.
            style={{ zIndex: t > 0.02 ? 30 : 1, height: CELL }}
          >
            {/* The table tilt: seen from above, leaning slightly back. */}
            <div
              className="relative h-full w-full"
              style={{ transform: 'perspective(900px) rotateX(14deg)', transformStyle: 'preserve-3d' }}
            >
              {pile.sleeves.map((s) => {
                const x = s.stackX + (s.fanX - s.stackX) * t;
                const y = s.stackY + (s.fanY - s.stackY) * t;
                const rot = s.stackRot + (s.fanRot - s.stackRot) * t;
                return (
                  <button
                    key={s.r.id}
                    type="button"
                    title={`${s.r.title}${s.r.year ? ` (${s.r.year})` : ''}`}
                    onClick={() => {
                      // Tap/click on a stacked pile opens it (mobile has no
                      // wheel); once fanned out, a click opens the record.
                      if (exploded) navigate(`/release/${s.r.id}`);
                      else setSpread((sp) => ({ ...sp, [pile.artist]: 1 }));
                    }}
                    className="absolute left-1/2 top-1/2 overflow-hidden rounded-sm shadow-sleeve ring-1 ring-ink/20 transition-transform duration-300 ease-out hover:brightness-105"
                    style={{
                      width: SLEEVE,
                      height: SLEEVE,
                      transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) rotate(${rot}deg)`,
                    }}
                  >
                    <Cover src={s.r.coverUrl} title={s.r.title} artist={s.r.artistDisplay} />
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() =>
                setSpread((sp) => ({ ...sp, [pile.artist]: (sp[pile.artist] ?? 0) > 0.45 ? 0 : 1 }))
              }
              className="absolute -bottom-10 left-1/2 z-40 max-w-full -translate-x-1/2 truncate rounded-full bg-cream/85 px-3 py-1 text-center text-sm font-medium text-mocha shadow-sm ring-1 ring-ink/10 backdrop-blur hover:text-accent"
              title={exploded ? 'Rempiler' : 'Éclater la pile'}
            >
              {pile.artist} · {pile.sleeves.length}
            </button>
          </div>
        );
      })}
    </div>
  );
}
