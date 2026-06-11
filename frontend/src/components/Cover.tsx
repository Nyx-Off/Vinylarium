import { useState } from 'react';
import clsx from 'clsx';

interface Props {
  src?: string | null;
  title?: string;
  artist?: string;
  className?: string;
}

/** Square cover image with a stylised record-sleeve fallback. */
export function Cover({ src, title, artist, className }: Props) {
  const [errored, setErrored] = useState(false);

  if (src && !errored) {
    return (
      <img
        src={src}
        alt={title || ''}
        loading="lazy"
        draggable={false}
        onError={() => setErrored(true)}
        className={clsx('h-full w-full object-cover', className)}
      />
    );
  }

  return (
    <div
      className={clsx(
        'flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-mocha to-vinyl p-3 text-center text-cream/85',
        className,
      )}
    >
      <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-ink/70 ring-4 ring-ink/40">
        <div className="h-2.5 w-2.5 rounded-full bg-cream/70" />
      </div>
      <span className="line-clamp-2 text-[11px] font-semibold leading-tight">{title}</span>
      {artist && <span className="line-clamp-1 text-[10px] opacity-70">{artist}</span>}
    </div>
  );
}
