import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useNowPlaying, useRelease, useSpotifyStatus } from '../api/hooks';
import { api, errorMessage } from '../api/client';
import { Cover } from '../components/Cover';
import { Spinner } from '../components/Spinner';

// Crisp transport icons (currentColor) — no emoji coloring, on-theme.
const TransportIcon = ({ d, className = 'h-5 w-5' }: { d: string; className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    <path d={d} />
  </svg>
);
const ICON = {
  prev: 'M6 6h2v12H6zM18 6v12l-8.5-6z',
  next: 'M6 6l8.5 6L6 18zM16 6h2v12h-2z',
  play: 'M8 5v14l11-7z',
  pause: 'M6 5h4v14H6zM14 5h4v14h-4z',
};

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

  // ── Spotify transport (only when an account is connected) ────────────────
  const qc = useQueryClient();
  const { data: spotify } = useSpotifyStatus();
  const connected = Boolean(spotify?.connected);
  const { data: np } = useNowPlaying(connected);
  const playing = Boolean(np?.playing);
  const hasContext = Boolean(np?.title); // a track is loaded (playing or paused)
  const [spBusy, setSpBusy] = useState<string | null>(null);
  const [spMsg, setSpMsg] = useState('');

  async function runSpotify(key: string, req: () => Promise<{ data: any }>) {
    setSpBusy(key);
    setSpMsg('');
    try {
      const { data } = await req();
      if (data?.ok === false) {
        const labels: Record<string, string> = {
          not_connected: 'Connectez votre compte Spotify dans les Paramètres.',
          not_found: 'Introuvable sur Spotify.',
          no_device: 'Aucun appareil Spotify actif — ouvrez Spotify puis réessayez.',
          premium: 'Spotify Premium requis pour la lecture à distance.',
          error: 'Action impossible pour le moment.',
        };
        setSpMsg(labels[data.reason ?? 'error'] ?? 'Action impossible.');
      }
      qc.invalidateQueries({ queryKey: ['spotify-now'] });
      // Spotify lags a moment after a skip — refetch once more to catch up.
      setTimeout(() => qc.invalidateQueries({ queryKey: ['spotify-now'] }), 800);
    } catch (e) {
      setSpMsg(errorMessage(e));
    } finally {
      setSpBusy(null);
    }
  }

  function togglePlay() {
    if (playing) return runSpotify('playpause', () => api.post('/spotify/control', { action: 'pause' }));
    if (hasContext) return runSpotify('playpause', () => api.post('/spotify/control', { action: 'resume' }));
    // Nothing loaded → start THIS record.
    return runSpotify('playpause', () => api.post('/spotify/play', { releaseId: id }));
  }
  const skip = (action: 'next' | 'previous') =>
    runSpotify(action, () => api.post('/spotify/control', { action }));

  useEffect(() => {
    if (!spMsg) return;
    const t = setTimeout(() => setSpMsg(''), 4500);
    return () => clearTimeout(t);
  }, [spMsg]);

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

          {/* Spotify transport — only when an account is connected */}
          {connected && (
            <div className="mt-6 flex flex-col items-center gap-3">
              {np?.title && (
                <div className="flex items-center gap-2 text-xs text-cream/55">
                  {playing && (
                    <span className="flex h-3 items-end gap-[2px]" aria-hidden>
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className="w-[2px] animate-eq rounded-full bg-cream/70"
                          style={{ height: '100%', animationDelay: `${i * 0.18}s` }}
                        />
                      ))}
                    </span>
                  )}
                  <span className="max-w-[70vw] truncate">
                    {np.title}
                    {np.artist ? ` — ${np.artist}` : ''}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2 rounded-full border border-cream/10 bg-cream/5 px-3 py-2 backdrop-blur">
                <button
                  onClick={() => skip('previous')}
                  disabled={spBusy !== null}
                  title="Précédent"
                  aria-label="Précédent"
                  className="flex h-11 w-11 items-center justify-center rounded-full text-cream/80 transition-colors hover:bg-cream/10 disabled:opacity-40"
                >
                  <TransportIcon d={ICON.prev} />
                </button>
                <button
                  onClick={togglePlay}
                  disabled={spBusy !== null}
                  title={playing ? 'Pause' : 'Lecture'}
                  aria-label={playing ? 'Pause' : 'Lecture'}
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-[#1DB954] text-white shadow-lg transition-transform hover:scale-105 disabled:opacity-60"
                >
                  <TransportIcon className="h-7 w-7" d={playing ? ICON.pause : ICON.play} />
                </button>
                <button
                  onClick={() => skip('next')}
                  disabled={spBusy !== null}
                  title="Suivant"
                  aria-label="Suivant"
                  className="flex h-11 w-11 items-center justify-center rounded-full text-cream/80 transition-colors hover:bg-cream/10 disabled:opacity-40"
                >
                  <TransportIcon d={ICON.next} />
                </button>
              </div>
              {spMsg && <p className="max-w-[80vw] text-center text-xs text-cream/70">{spMsg}</p>}
            </div>
          )}

          <button
            onClick={() => {
              spin.current = !spin.current;
              setSpinUi(spin.current);
            }}
            className="mt-5 rounded-full bg-cream/10 px-4 py-1.5 text-xs text-cream/70 hover:bg-cream/20"
          >
            {spinUi ? 'Figer la pochette' : '↻ Faire tourner'}
          </button>
        </>
      )}
    </div>
  );
}
