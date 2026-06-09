import { useEffect, useRef, useState } from 'react';
import { ReleaseListItem } from '../api/types';
import { Cover } from './Cover';

/**
 * Slot-machine reveal for the "au hasard" button: covers roll past, decelerating,
 * then land on the picked release before navigating to it.
 */
export function RandomRoulette({
  pool,
  pick,
  onGo,
  onCancel,
}: {
  pool: ReleaseListItem[];
  pick: ReleaseListItem;
  onGo: (id: string) => void;
  onCancel: () => void;
}) {
  const [display, setDisplay] = useState<ReleaseListItem>(pool[0] ?? pick);
  const [landed, setLanded] = useState(false);
  const [frame, setFrame] = useState(0); // bumps to retrigger the roll animation
  const timer = useRef<number>();

  useEffect(() => {
    const reel = pool.length > 1 ? pool : [pick];
    // Decelerating schedule of frame durations (~2.2s total).
    const delays: number[] = [];
    let d = 55;
    while (d < 360) {
      delays.push(d);
      d *= 1.13;
    }

    let i = 0;
    const step = () => {
      if (i < delays.length) {
        setDisplay(reel[Math.floor(Math.random() * reel.length)]);
        setFrame((f) => f + 1);
        timer.current = window.setTimeout(step, delays[i]);
        i++;
      } else {
        setDisplay(pick);
        setFrame((f) => f + 1);
        setLanded(true);
        timer.current = window.setTimeout(() => onGo(pick.id), 850);
      }
    };
    step();

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') onGo(pick.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, onGo, pick.id]);

  return (
    <div
      onClick={() => (landed ? onGo(pick.id) : onCancel())}
      className="animate-fadeup fixed inset-0 z-[60] flex flex-col items-center justify-center bg-ink/90 p-6 backdrop-blur-sm"
      style={{
        backgroundImage:
          'radial-gradient(circle at 50% 42%, rgba(0,0,0,0) 28%, rgba(0,0,0,0.6) 100%)',
      }}
    >
      <p className="mb-5 font-display text-2xl font-bold text-cream">
        {landed ? '✦ Et c’est…' : '🎲 Tirage au sort…'}
      </p>

      <div
        className={`relative aspect-square overflow-hidden rounded-xl ring-cream/10 transition-all duration-500 ease-out ${
          landed
            ? 'w-[min(68vh,90vw)] ring-2 ring-accent shadow-[0_35px_90px_-20px_rgba(184,69,31,0.65)]'
            : 'w-[min(48vh,74vw)] shadow-2xl ring-1'
        }`}
      >
        <div key={frame} className={landed ? '' : 'animate-roll'}>
          <Cover src={display.coverUrl} title={display.title} artist={display.artistDisplay} />
        </div>
      </div>

      <div className="mt-5 h-12 text-center">
        {landed && (
          <>
            <p className="line-clamp-1 text-lg font-semibold text-cream">{pick.title}</p>
            <p className="line-clamp-1 text-sm text-cream/60">
              {pick.artistDisplay}
              {pick.year ? ` · ${pick.year}` : ''}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
