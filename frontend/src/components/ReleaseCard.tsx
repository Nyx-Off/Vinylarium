import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { ReleaseListItem } from '../api/types';
import { Cover } from './Cover';

const PENDING = new Set(['PENDING', 'QUEUED', 'ENRICHING']);

export function ReleaseCard({
  r,
  selectable = false,
  selected = false,
  onToggleSelect,
}: {
  r: ReleaseListItem;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}) {
  const inner = (
    <>
      <div
        className={clsx(
          'relative aspect-square overflow-hidden rounded-xl shadow-sleeve ring-1 transition-transform duration-200',
          selectable ? '' : 'group-hover:-translate-y-1',
          selected ? 'ring-2 ring-accent' : 'ring-ink/10',
        )}
      >
        <Cover src={r.coverUrl} title={r.title} artist={r.artistDisplay} />
        {r.isLive && (
          <span className="chip chip-active absolute left-2 top-2 text-[10px]">LIVE</span>
        )}
        {PENDING.has(r.enrichmentStatus) && (
          <span className="absolute right-2 top-2 rounded-full bg-ink/70 px-2 py-0.5 text-[10px] text-cream">
            sync…
          </span>
        )}
        {selectable && (
          <span
            className={clsx(
              'absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-bold',
              selected ? 'border-accent bg-accent text-cream' : 'border-cream/80 bg-ink/40 text-transparent',
            )}
          >
            ✓
          </span>
        )}
        {r.hidden && (
          <span className="absolute bottom-2 right-2 rounded-full bg-ink/70 px-2 py-0.5 text-[10px] text-cream">
            masqué
          </span>
        )}
      </div>
      <div className="mt-2 px-0.5">
        <p className="line-clamp-1 text-sm font-semibold">{r.title}</p>
        <p className="line-clamp-1 text-xs text-mocha">
          {r.artistDisplay}
          {r.year ? ` · ${r.year}` : ''}
        </p>
      </div>
    </>
  );

  if (selectable) {
    return (
      <button type="button" onClick={() => onToggleSelect?.(r.id)} className="block w-full text-left">
        {inner}
      </button>
    );
  }

  return (
    <Link to={`/release/${r.id}`} className="group block">
      {inner}
    </Link>
  );
}
