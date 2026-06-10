import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useRelease } from '../api/hooks';
import { Cover } from '../components/Cover';
import { Spinner } from '../components/Spinner';

// Degrees of sleeve rotation per pixel of drag.
const DRAG_FACTOR = 0.6;
// Cruising speed of the automatic rotation, in deg/ms.
const BASE_SPEED = 0.03;

/**
 * Minimalist fullscreen "vitrine": the sleeve as a 3D object that slowly spins
 * to reveal front and back. Drag (mouse or finger) to rotate by hand — a fling
 * keeps spinning with momentum, then eases back to the auto-spin, or settles
 * flat on the nearest face when paused. Tablet-friendly.
 */
export default function ShowcasePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: r, isLoading } = useRelease(id);

  const innerRef = useRef<HTMLDivElement>(null);
  const angle = useRef(0);
  const vel = useRef(BASE_SPEED); // current angular velocity, deg/ms
  const spin = useRef(true);
  const drag = useRef<{
    pointerId: number;
    x0: number;
    start: number;
    samples: { t: number; x: number }[];
  } | null>(null);
  const [spinUi, setSpinUi] = useState(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && navigate(`/release/${id}`);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id, navigate]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      if (!drag.current) {
        // Momentum: relax the fling velocity toward the cruising speed
        // (or toward rest when paused) — exponential friction.
        const base = spin.current ? BASE_SPEED : 0;
        vel.current += (base - vel.current) * (1 - Math.exp(-dt / 650));
        angle.current += vel.current * dt;
        // Once almost still and paused, settle flat on the nearest face.
        if (!spin.current && Math.abs(vel.current) < 0.02) {
          const target = Math.round(angle.current / 180) * 180;
          angle.current += (target - angle.current) * Math.min(1, dt / 200);
        }
      }
      if (innerRef.current) {
        innerRef.current.style.transform = `rotateX(-6deg) rotateY(${angle.current}deg)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [r]);

  const onDown = (e: React.PointerEvent) => {
    if (drag.current) return; // one finger drives the rotation
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = {
      pointerId: e.pointerId,
      x0: e.clientX,
      start: angle.current,
      samples: [{ t: performance.now(), x: e.clientX }],
    };
    vel.current = 0;
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    angle.current = d.start + (e.clientX - d.x0) * DRAG_FACTOR;
    const now = performance.now();
    d.samples.push({ t: now, x: e.clientX });
    while (d.samples.length > 2 && now - d.samples[0].t > 120) d.samples.shift();
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    // Fling velocity from the recent samples of the gesture.
    const first = d.samples[0];
    const lastS = d.samples[d.samples.length - 1];
    const span = lastS.t - first.t;
    if (span > 15) {
      const v = ((lastS.x - first.x) / span) * DRAG_FACTOR;
      vel.current = Math.max(-2.5, Math.min(2.5, v));
    }
  };

  const back = r?.backCoverUrl ?? r?.coverUrl ?? null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-ink px-6 py-10 text-cream">
      <Link
        to={`/release/${id}`}
        className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full bg-cream/10 text-xl text-cream/80 transition-colors hover:bg-cream/20"
        title="Fermer (Échap)"
      >
        ✕
      </Link>

      {isLoading || !r ? (
        <Spinner label="Chargement…" />
      ) : (
        <>
          <div
            className="touch-none select-none"
            style={{ perspective: '1400px' }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          >
            <div
              ref={innerRef}
              className="relative aspect-square w-[min(52vh,82vw)] cursor-grab [transform-style:preserve-3d] active:cursor-grabbing"
            >
              {/* Front */}
              <div className="absolute inset-0 overflow-hidden rounded-xl shadow-2xl [backface-visibility:hidden]">
                <Cover src={r.coverUrl} title={r.title} artist={r.artistDisplay} />
              </div>
              {/* Back */}
              <div className="absolute inset-0 overflow-hidden rounded-xl shadow-2xl [backface-visibility:hidden] [transform:rotateY(180deg)]">
                <Cover src={back} title="Verso" />
              </div>
            </div>
          </div>

          <h1 className="mt-8 text-center font-display text-2xl font-bold sm:text-3xl">{r.title}</h1>
          <p className="mt-1 text-center text-base text-cream/60">
            {r.artistDisplay}
            {r.year ? ` · ${r.year}` : ''}
          </p>

          <button
            onClick={() => {
              spin.current = !spin.current;
              setSpinUi(spin.current);
            }}
            className="mt-5 rounded-full bg-cream/10 px-4 py-1.5 text-sm text-cream/80 hover:bg-cream/20"
          >
            {spinUi ? '⏸ Pause' : '▶ Tourner'}
          </button>
        </>
      )}
    </div>
  );
}
