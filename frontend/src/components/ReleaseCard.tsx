import { Link } from 'react-router-dom';
import { ReleaseListItem } from '../api/types';
import { Cover } from './Cover';

const PENDING = new Set(['PENDING', 'QUEUED', 'ENRICHING']);

export function ReleaseCard({ r }: { r: ReleaseListItem }) {
  return (
    <Link to={`/release/${r.id}`} className="group block">
      <div className="relative aspect-square overflow-hidden rounded-xl shadow-sleeve ring-1 ring-ink/10 transition-transform duration-200 group-hover:-translate-y-1">
        <Cover src={r.coverUrl} title={r.title} artist={r.artistDisplay} />
        {r.isLive && (
          <span className="chip chip-active absolute left-2 top-2 text-[10px]">LIVE</span>
        )}
        {PENDING.has(r.enrichmentStatus) && (
          <span className="absolute right-2 top-2 rounded-full bg-ink/70 px-2 py-0.5 text-[10px] text-cream">
            sync…
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
    </Link>
  );
}
