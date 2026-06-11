import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ReleaseListItem } from '../api/types';
import { Cover } from './Cover';

const CRATE_SIZE = 12; // records per crate
const W = 264; // crate width (px)
const D = 132; // crate depth — just enough for the tightly packed sleeves
const WALL = 118; // back wall height
const WALL_F = 62; // front wall is lower — the displayed sleeve rests on its edge
const S = 216; // sleeve size
// Whole crate tipped so the camera looks DOWN into the bin. CSS rotateX has
// +Y pointing down, so "top toward the viewer" is a NEGATIVE angle — angles in
// this file are expressed as "lean forward = positive" and negated on render.
const TILT = 28;

// Screen-space band (cell px above the bin bottom, h ≈ y·cos(TILT) − z·sin(TILT))
// where the current sleeve's face is the only thing visible: above the highest
// point the flipped pile reaches riding the front edge (≈60), below the
// standing pack's top slivers. A flat overlay there guarantees the click —
// the 3D planes of the pile cut through this region and steal pointer hits.
const FACE_TOP = S * Math.cos((TILT * Math.PI) / 180) - 28;
const FACE_BOTTOM = 66;

const WOOD = 'linear-gradient(180deg, #9a7a59 0%, #85674a 55%, #6f5440 100%)';
const SLATS =
  'repeating-linear-gradient(0deg, rgba(35,22,12,0.16) 0 2px, transparent 2px 30px)';

/** Small deterministic -1..1 wobble so the flipped stack doesn't look machined. */
function wobble(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (((h >>> 0) % 1000) / 999) * 2 - 1;
}

function crateLabel(chunk: ReleaseListItem[], sortHint: string | undefined, start: number) {
  const first = chunk[0];
  const last = chunk[chunk.length - 1];
  const initial = (s?: string | null) => (s ?? '').trim().charAt(0).toUpperCase() || '·';
  const range = (a: string | number, b: string | number) => (a === b ? `${a}` : `${a}–${b}`);
  if (sortHint === 'artist') return range(initial(first.artistDisplay), initial(last.artistDisplay));
  if (sortHint === 'title') return range(initial(first.title), initial(last.title));
  if (sortHint === 'yearAsc' || sortHint === 'yearDesc')
    return range(first.year ?? '·', last.year ?? '·');
  return range(start + 1, start + chunk.length);
}

/**
 * Record-shop floor: the collection split into wooden crates laid out on a
 * grid, ~12 sleeves per crate. Flipping is continuous from crate to crate —
 * sleeves never leave the bin: the pack stands nearly vertical (only top
 * slivers showing), everything already browsed lies flipped forward against
 * the low front edge, and the current sleeve is simply the first one still
 * standing, facing you. Wheel over whichever crate the
 * mouse is on (no click needed), swipe/drag in any direction but ONLY when
 * the gesture starts on the bin itself (outside the bins a touch scrolls the
 * page natively), arrow keys (←/→ record, ↑/↓ crate) or the bottom bar
 * buttons; click a sleeve to jump to it, click the active one to open its
 * page.
 */
export function CrateBrowser({ items, sortHint }: { items: ReleaseListItem[]; sortHint?: string }) {
  const [current, setCurrent] = useState(0);
  const navigate = useNavigate();
  const gridRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef<(HTMLDivElement | null)[]>([]);
  const currentRef = useRef(0);
  const wheelLock = useRef(false);
  const drag = useRef<{ x: number; y: number; crate: number; moved: boolean } | null>(null);

  const crates = useMemo(() => {
    const out: ReleaseListItem[][] = [];
    for (let i = 0; i < items.length; i += CRATE_SIZE) out.push(items.slice(i, i + CRATE_SIZE));
    return out;
  }, [items]);

  const clamp = (n: number) => Math.max(0, Math.min(items.length - 1, n));
  const go = (delta: number) => setCurrent((c) => clamp(c + delta));
  const activeCrate = Math.floor(current / CRATE_SIZE);
  currentRef.current = current;

  // New search/page → back to the first sleeve of the first crate.
  useEffect(() => setCurrent(0), [items]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowDown') go(CRATE_SIZE);
      else if (e.key === 'ArrowUp') go(-CRATE_SIZE);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  // Wheel flips whichever crate the mouse is over — no click needed (native
  // non-passive listener so we can preventDefault the page scroll).
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const cell = (e.target as HTMLElement).closest('[data-crate]');
      if (!cell) return;
      if (Math.abs(e.deltaY) < 4) return;
      e.preventDefault();
      if (wheelLock.current) return;
      wheelLock.current = true;
      const ci = Number(cell.getAttribute('data-crate'));
      if (ci !== Math.floor(currentRef.current / CRATE_SIZE)) {
        // entering the bin under the cursor: scroll down starts at its first
        // sleeve, scroll up picks it up from the back
        const start = ci * CRATE_SIZE;
        const len = Math.min(CRATE_SIZE, items.length - start);
        setCurrent(e.deltaY > 0 ? start : start + len - 1);
      } else {
        go(e.deltaY > 0 ? 1 : -1);
      }
      setTimeout(() => (wheelLock.current = false), 160);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  // Keep the crate being browsed in view when flipping crosses into the next.
  useEffect(() => {
    cellRefs.current[activeCrate]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeCrate]);

  const active = items[current];

  return (
    <div>
      <div
        ref={gridRef}
        className="grid justify-center gap-x-6 gap-y-10 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]"
      >
        {crates.map((chunk, ci) => {
          const isActiveCrate = ci === activeCrate;
          const browsed = ci < activeCrate; // whole crate already flipped through
          // First sleeve still standing (everything before it has fallen):
          // the current one here, the first one in crates not yet reached.
          const displayIndex = browsed ? -1 : isActiveCrate ? current - ci * CRATE_SIZE : 0;
          const gap = (D - 36) / CRATE_SIZE; // ≈8px between sleeves — pressed together
          return (
            <div
              key={ci}
              ref={(el) => (cellRefs.current[ci] = el)}
              data-crate={ci}
              className={`relative h-[330px] select-none ${
                isActiveCrate ? '' : 'cursor-pointer'
              }`}
              onClick={() => {
                if (!isActiveCrate && !drag.current?.moved) setCurrent(ci * CRATE_SIZE);
              }}
              onClickCapture={(e) => {
                if (drag.current?.moved) {
                  e.preventDefault();
                  e.stopPropagation();
                }
              }}
            >
              {/* Crate tag */}
              <span
                className={`absolute left-1/2 top-0 z-10 -translate-x-1/2 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors ${
                  isActiveCrate
                    ? 'bg-accent text-cream shadow'
                    : 'bg-cream text-mocha ring-1 ring-mocha/30'
                }`}
              >
                {crateLabel(chunk, sortHint, ci * CRATE_SIZE)}
              </span>

              {/* Bin interaction zone, exactly the crate's width: a drag that
                  STARTS here flips the records (any direction — vertical works
                  like the wheel); a touch landing outside the bins keeps the
                  native page scroll. */}
              <div
                className="absolute inset-y-0 left-1/2 -translate-x-1/2 [touch-action:none]"
                style={{ width: W + 12 }}
                onPointerDown={(e) => {
                  drag.current = { x: e.clientX, y: e.clientY, crate: ci, moved: false };
                }}
                onPointerMove={(e) => {
                  const d = drag.current;
                  if (!d || e.buttons === 0) return;
                  const dx = e.clientX - d.x;
                  const dy = e.clientY - d.y;
                  const delta = Math.abs(dy) >= Math.abs(dx) ? dy : dx;
                  if (Math.abs(delta) > 48) {
                    if (Math.floor(currentRef.current / CRATE_SIZE) !== ci)
                      setCurrent(ci * CRATE_SIZE);
                    else go(delta < 0 ? 1 : -1); // up or left = next
                    drag.current = { x: e.clientX, y: e.clientY, crate: ci, moved: true };
                  }
                }}
                onPointerCancel={() => {
                  drag.current = null;
                }}
                onPointerUp={() => {
                  // Let click handlers read `moved` before clearing it.
                  setTimeout(() => (drag.current = null), 0);
                }}
              >
              {/* The 3D bin */}
              <div
                className="absolute inset-x-0 bottom-1 flex justify-center transition-[filter,transform] duration-300"
                style={{
                  perspective: 1100,
                  perspectiveOrigin: '50% -10%',
                  filter: isActiveCrate ? 'none' : 'brightness(0.85) saturate(0.9)',
                  transform: isActiveCrate ? 'none' : 'scale(0.96)',
                }}
              >
                <div
                  className="relative"
                  style={{
                    width: W,
                    height: S + 36,
                    transformStyle: 'preserve-3d',
                    transform: `rotateX(${-TILT}deg)`,
                    transformOrigin: '50% 100%',
                  }}
                >
                  {/* floor */}
                  <div
                    className="pointer-events-none absolute bottom-0 left-1/2"
                    style={{
                      width: W,
                      height: D,
                      marginLeft: -W / 2,
                      transformOrigin: 'bottom center',
                      transform: `translateZ(${-D / 2}px) rotateX(-90deg)`,
                      background: 'linear-gradient(180deg, #4a382a, #5c4634)',
                    }}
                  />
                  {/* back wall (we see its inner face) */}
                  <div
                    className="pointer-events-none absolute bottom-0 left-1/2 rounded-t-sm"
                    style={{
                      width: W,
                      height: WALL,
                      marginLeft: -W / 2,
                      transform: `translateZ(${-D / 2}px)`,
                      background: `${SLATS}, ${WOOD}`,
                      boxShadow: 'inset 0 -28px 30px rgba(35,22,12,0.35)',
                    }}
                  />
                  {/* side walls, top edge sloping down toward the low front
                      (local left = front of the bin after the rotateY) */}
                  {[-1, 1].map((side) => (
                    <div
                      key={side}
                      className="pointer-events-none absolute bottom-0 left-1/2"
                      style={{
                        width: D,
                        height: WALL,
                        marginLeft: -D / 2,
                        transformOrigin: 'bottom center',
                        transform: `translateX(${(side * W) / 2}px) rotateY(90deg)`,
                        background: `${SLATS}, ${WOOD}`,
                        backfaceVisibility: 'visible',
                        filter: 'brightness(0.82)',
                        clipPath: `polygon(0% 100%, 0% ${(((WALL - WALL_F) / WALL) * 100).toFixed(1)}%, 100% 0%, 100% 100%)`,
                      }}
                    />
                  ))}

                  {/* sleeves — they NEVER leave the crate: flipped ones tip
                      forward over the front edge, the rest lean back */}
                  {chunk.map((r, j) => {
                    const gi = ci * CRATE_SIZE + j;
                    const w = wobble(r.id);
                    // Only two states: fallen forward, or standing in the pack.
                    // The current sleeve is simply the FIRST one still standing,
                    // facing us now that everything in front of it has fallen.
                    const isFront = j === displayIndex;
                    const flipped = browsed || j < displayIndex;
                    // j = 0 sits at the FRONT of the bin, deeper records behind;
                    // bottoms never move, only the lean changes
                    const z = D / 2 - 13 - j * gap;
                    let angle: number;
                    let lift: number;
                    if (flipped) {
                      // flipped sleeves stack PARALLEL, all at the same lean
                      // pressed against the front edge — varying angles read as
                      // a splayed fan, not a pile. Angle wobble must stay under
                      // ~±0.6°: at 8px spacing, ±1.5° makes neighbours intersect
                      // within the sleeve height (8 / sin(2·1.5°) < 216).
                      // Lie LOW (52°): at 34° the pile towered over the standing
                      // pack and stole the clicks aimed at the current sleeve
                      angle = 52 + w * 0.6;
                      // the front of the pile rides up over the edge instead of
                      // clipping through the wall
                      lift = Math.max(
                        0,
                        WALL_F - 4 - (D / 2 - z) / Math.tan((angle * Math.PI) / 180),
                      );
                    } else {
                      // standing in the pack, top sliver visible — same ±0.6°
                      // ceiling on the wobble, the life comes from the height
                      angle = -2 + w * 0.6;
                      lift = w * 2;
                    }
                    const depthBehind = !flipped && !isFront ? j - Math.max(0, displayIndex) : 0;
                    return (
                      <div
                        key={r.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (drag.current?.moved) return;
                          if (gi === current) navigate(`/release/${r.id}`);
                          else setCurrent(gi);
                        }}
                        className="absolute bottom-0 left-1/2 cursor-pointer rounded-[3px] ring-1 ring-ink/20"
                        style={{
                          width: S,
                          height: S,
                          marginLeft: -S / 2,
                          transformOrigin: 'bottom center',
                          transform: `translateZ(${z}px) translateY(${-lift}px) rotateX(${-angle}deg)`,
                          transition:
                            'transform 320ms cubic-bezier(0.25, 1.25, 0.4, 1), filter 300ms',
                          filter: isFront
                            ? 'none'
                            : `brightness(${Math.max(0.72, 0.92 - depthBehind * 0.03).toFixed(2)})`,
                          boxShadow: isFront
                            ? '0 18px 28px rgba(35,22,12,0.4)'
                            : '0 4px 10px rgba(35,22,12,0.3)',
                        }}
                      >
                        <div className="h-full w-full overflow-hidden rounded-[3px] bg-cream">
                          <Cover src={r.coverUrl} title={r.title} artist={r.artistDisplay} />
                        </div>
                        {/* paper edge catching the light on the top rim */}
                        <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] rounded-t-[3px] bg-white/50" />
                      </div>
                    );
                  })}

                  {/* front wall — low, the displayed sleeve rests on its edge;
                      clicks pass through the wood to the sleeve behind it */}
                  <div
                    className="pointer-events-none absolute bottom-0 left-1/2 rounded-t-sm"
                    style={{
                      width: W,
                      height: WALL_F,
                      marginLeft: -W / 2,
                      transform: `translateZ(${D / 2}px)`,
                      background: `${SLATS}, ${WOOD}`,
                      boxShadow:
                        'inset 0 2px 0 rgba(255,243,224,0.25), 0 14px 24px rgba(35,22,12,0.35)',
                    }}
                  />
                </div>
              </div>

              {/* Flat, always-on-top click zone over the current sleeve's
                  visible face (the 3D quads of the flipped pile otherwise
                  steal the hit even where the face is what you see). Lives
                  INSIDE the interaction zone so drags starting on it flip. */}
              {isActiveCrate && active && (
                <div
                  className="absolute left-1/2 z-10 -translate-x-1/2 cursor-pointer"
                  style={{
                    width: S - 16,
                    top: 326 - FACE_TOP, // cell is 330px, bin sits 4px up
                    height: FACE_TOP - FACE_BOTTOM,
                  }}
                  title={`${active.title} — ${active.artistDisplay}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (drag.current?.moved) return;
                    navigate(`/release/${active.id}`);
                  }}
                />
              )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Now-browsing bar, stays visible while the grid scrolls (sits above
          the mobile bottom tab bar) */}
      <div className="pointer-events-none sticky bottom-20 z-30 mt-8 flex justify-center md:bottom-4">
        <div className="pointer-events-auto card flex items-center gap-4 px-4 py-2 shadow-xl">
          <button
            className="btn-outline px-3"
            disabled={current <= 0}
            onClick={() => go(-1)}
            title="Disque précédent (←)"
          >
            ←
          </button>
          <div className="min-w-0 max-w-xs text-center">
            {active && (
              <>
                <p className="line-clamp-1 font-semibold">{active.title}</p>
                <p className="line-clamp-1 text-xs text-mocha">
                  {active.artistDisplay}
                  {active.year ? ` · ${active.year}` : ''}
                </p>
              </>
            )}
            <p className="text-[11px] text-mocha/70">
              {current + 1} / {items.length} · bac {activeCrate + 1}/{crates.length}
            </p>
          </div>
          <button
            className="btn-outline px-3"
            disabled={current >= items.length - 1}
            onClick={() => go(1)}
            title="Disque suivant (→)"
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}
