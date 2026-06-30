import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useDuplicates } from '../api/hooks';
import { api } from '../api/client';
import { DuplicateRelease } from '../api/types';
import { Spinner } from '../components/Spinner';

function DupCard({ r, onToggle, busy }: { r: DuplicateRelease; onToggle: () => void; busy: boolean }) {
  const yr = r.pressingYear ?? r.year;
  return (
    <div
      className={`card flex gap-3 p-3 ${r.hidden ? 'opacity-50' : ''}`}
    >
      <Link to={`/release/${r.id}`} className="shrink-0">
        {r.coverUrl ? (
          <img src={r.coverUrl} alt="" className="h-16 w-16 rounded object-cover" />
        ) : (
          <div className="h-16 w-16 rounded bg-ink/10" />
        )}
      </Link>
      <div className="min-w-0 flex-1">
        <Link to={`/release/${r.id}`} className="block truncate font-medium hover:text-accent">
          {r.title}
        </Link>
        <div className="truncate text-sm text-mocha">{r.artistDisplay}</div>
        <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-mocha/70">
          {yr && <span>{yr}</span>}
          {r.country && <span>· {r.country}</span>}
          {r.catalogNumber && <span>· {r.catalogNumber}</span>}
          {r.hidden && <span className="text-accent">· masqué</span>}
        </div>
      </div>
      <button onClick={onToggle} disabled={busy} className="btn-ghost h-fit self-center text-xs">
        {r.hidden ? 'Afficher' : 'Masquer'}
      </button>
    </div>
  );
}

export default function DuplicatesPage() {
  const { data, isLoading } = useDuplicates();
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggleHidden(r: DuplicateRelease) {
    setBusyId(r.id);
    try {
      await api.patch(`/releases/${r.id}`, { hidden: !r.hidden });
      await qc.invalidateQueries({ queryKey: ['duplicates'] });
      qc.invalidateQueries({ queryKey: ['releases'] });
    } finally {
      setBusyId(null);
    }
  }

  if (isLoading || !data) return <Spinner label="Recherche des doublons…" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Doublons</h1>
        <p className="mt-1 text-sm text-mocha">
          Disques regroupés par œuvre identique (même master Discogs, ou même artiste + titre).
          Plusieurs pressages d'un même album apparaissent ici — masquez ceux que vous ne voulez
          pas voir dans la bibliothèque, ils restent trouvables par la recherche.
        </p>
      </div>

      {data.groups.length === 0 ? (
        <p className="py-16 text-center text-mocha">
          Aucun doublon détecté. 🎉
        </p>
      ) : (
        <>
          <p className="text-sm text-mocha">
            {data.groups.length} groupe{data.groups.length > 1 ? 's' : ''} · {data.total} disques
            concernés
          </p>
          {data.groups.map((g) => (
            <div key={g.key} className="space-y-2">
              <div className="flex items-baseline gap-2">
                <h2 className="font-display text-lg font-bold">
                  {g.releases[0].artistDisplay} — {g.releases[0].title}
                </h2>
                <span className="chip">{g.count}×</span>
                <span className="text-xs text-mocha/60">
                  {g.kind === 'master' ? 'même master Discogs' : 'même artiste + titre'}
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {g.releases.map((r) => (
                  <DupCard
                    key={r.id}
                    r={r}
                    busy={busyId === r.id}
                    onToggle={() => toggleHidden(r)}
                  />
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
