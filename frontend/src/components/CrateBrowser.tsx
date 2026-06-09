import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ReleaseListItem } from '../api/types';
import { Cover } from './Cover';

/**
 * Vertical "record bin" browser: sleeves leaning back in a crate, the active
 * one upright at the front. Flip through with the wheel, drag, arrow keys or the
 * buttons — each next sleeve comes up in front of the previous, like flicking
 * through records at a shop.
 */
export function CrateBrowser({ items }: { items: ReleaseListItem[] }) {
  const [current, setCurrent] = useState(0);
  const navigate = useNavigate();
  const wheelLock = useRef(false);
  const drag = useRef<{ y: number; moved: boolean } | null>(null);

  const clamp = (n: number) => Math.max(0, Math.min(items.length - 1, n));
  const go = (delta: number) => setCurrent((c) => clamp(c + delta));

  useEffect(() => {
    if (current > items.length - 1) setCurrent(clamp(current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  const onWheel = (e: React.WheelEvent) => {
    if (wheelLock.current) return;
    if (Math.abs(e.deltaY) < 4) return;
    wheelLock.current = true;
    go(e.deltaY > 0 ? 1 : -1);
    setTimeout(() => (wheelLock.current = false), 180);
  };

  const onDown = (e: React.PointerEvent) => {
    drag.current = { y: e.clientY, moved: false };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dy = e.clientY - drag.current.y;
    if (Math.abs(dy) > 60) {
      go(dy < 0 ? 1 : -1);
      drag.current = { y: e.clientY, moved: true };
    }
  };
  const onUp = () => {
    drag.current = null;
  };

  return (
    <div className="relative flex flex-col items-center">
      <div
        className="relative h-[68vh] w-full max-w-md touch-none select-none"
        style={{ perspective: '1100px' }}
        onWheel={onWheel}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
      >
        {items.map((r, i) => {
          const k = i - current;
          if (k < -2 || k > 4) return null;
          const isActive = k === 0;
          // Behind (k>0): lean back, stacked upward. Past (k<0): tip forward/down.
          const translateY = k >= 0 ? `-${k * 9}%` : `${-k * 46}%`;
          const translateZ = -Math.abs(k) * 140;
          const rotateX = k >= 0 ? -14 : 58;
          const scale = 1 - Math.abs(k) * 0.07;
          const opacity = k < 0 ? Math.max(0, 1 + k * 0.6) : 1 - k * 0.16;
          const onClick = () => {
            if (isActive) navigate(`/release/${r.id}`);
            else if (k > 0) setCurrent(i);
          };
          return (
            <div
              key={r.id}
              onClick={onClick}
              className={`absolute left-1/2 top-1/2 aspect-square w-[78%] -translate-x-1/2 -translate-y-1/2 rounded-lg shadow-sleeve ring-1 ring-ink/10 transition-all duration-300 ease-out ${
                k >= 0 ? 'cursor-pointer' : 'pointer-events-none'
              }`}
              style={{
                transform: `translate(-50%, -50%) translateY(${translateY}) translateZ(${translateZ}px) rotateX(${rotateX}deg) scale(${scale})`,
                transformOrigin: 'center bottom',
                zIndex: k < 0 ? 50 + k : 40 - k,
                opacity,
                filter: isActive ? 'none' : `brightness(${(0.85 - k * 0.07).toFixed(2)})`,
              }}
            >
              <div className="h-full w-full overflow-hidden rounded-lg">
                <Cover src={r.coverUrl} title={r.title} artist={r.artistDisplay} />
              </div>
              {/* Soft gradient on sleeves behind, for depth. */}
              {!isActive && k > 0 && (
                <div className="pointer-events-none absolute inset-0 rounded-lg bg-gradient-to-t from-ink/30 to-transparent" />
              )}
            </div>
          );
        })}
      </div>

      {/* Active title + controls */}
      <div className="mt-2 w-full max-w-md text-center">
        {items[current] && (
          <>
            <p className="line-clamp-1 text-lg font-semibold">{items[current].title}</p>
            <p className="line-clamp-1 text-sm text-mocha">
              {items[current].artistDisplay}
              {items[current].year ? ` · ${items[current].year}` : ''}
            </p>
          </>
        )}
        <div className="mt-3 flex items-center justify-center gap-4">
          <button
            className="btn-outline px-4"
            disabled={current <= 0}
            onClick={() => go(-1)}
            title="Précédent (↑)"
          >
            ↑ Précédent
          </button>
          <span className="text-xs text-mocha">
            {current + 1} / {items.length}
          </span>
          <button
            className="btn-outline px-4"
            disabled={current >= items.length - 1}
            onClick={() => go(1)}
            title="Suivant (↓)"
          >
            Suivant ↓
          </button>
        </div>
      </div>
    </div>
  );
}
