import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useRelease } from '../api/hooks';
import { Cover } from '../components/Cover';
import { Spinner } from '../components/Spinner';

/**
 * Minimalist fullscreen "vitrine": the sleeve as a 3D object that slowly spins
 * to reveal front and back. Drag to rotate by hand, or pause. Tablet-friendly.
 */
export default function ShowcasePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: r, isLoading } = useRelease(id);

  const innerRef = useRef<HTMLDivElement>(null);
  const angle = useRef(0);
  const spin = useRef(true);
  const drag = useRef<{ x: number; start: number } | null>(null);
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
      const dt = now - last;
      last = now;
      if (spin.current && !drag.current) angle.current += dt * 0.03;
      if (innerRef.current) {
        innerRef.current.style.transform = `rotateX(-6deg) rotateY(${angle.current}deg)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [r]);

  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, start: angle.current };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    angle.current = drag.current.start + (e.clientX - drag.current.x) * 0.6;
  };
  const onUp = () => (drag.current = null);

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
            onPointerLeave={onUp}
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
