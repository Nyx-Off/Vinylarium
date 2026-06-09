import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useReleases } from '../api/hooks';
import { ReleaseCard } from '../components/ReleaseCard';
import { Cover } from '../components/Cover';
import { Spinner } from '../components/Spinner';

const SORTS = [
  { value: 'addedDesc', label: 'Ajout récent' },
  { value: 'title', label: 'Titre A→Z' },
  { value: 'artist', label: 'Artiste A→Z' },
  { value: 'yearAsc', label: 'Année ↑' },
  { value: 'yearDesc', label: 'Année ↓' },
  { value: 'ratingDesc', label: 'Note ↓' },
];

export default function LibraryPage() {
  const [view, setView] = useState<'wall' | 'crate'>('wall');
  const [sort, setSort] = useState('addedDesc');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching } = useReleases({ q: q || undefined, sort, page, pageSize: 60 });

  const items = data?.items ?? [];

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Bibliothèque</h1>
          <p className="text-sm text-mocha">
            {data ? `${data.total} disque${data.total > 1 ? 's' : ''}` : '…'}
            {isFetching && ' · mise à jour…'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input w-48"
            placeholder="Rechercher…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
          <select
            className="input w-40"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <div className="flex overflow-hidden rounded-full border border-ink/15">
            <button
              className={`px-3 py-1.5 text-sm ${view === 'wall' ? 'bg-accent text-cream' : 'text-mocha'}`}
              onClick={() => setView('wall')}
            >
              Mur
            </button>
            <button
              className={`px-3 py-1.5 text-sm ${view === 'crate' ? 'bg-accent text-cream' : 'text-mocha'}`}
              onClick={() => setView('crate')}
            >
              Bac
            </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <Spinner label="Chargement de la collection…" />
      ) : items.length === 0 ? (
        <div className="card mx-auto mt-10 max-w-md p-8 text-center">
          <h2 className="mb-2 font-display text-2xl">Collection vide</h2>
          <p className="mb-5 text-sm text-mocha">
            Importez votre export Discogs ou ajoutez un disque manuellement pour commencer.
          </p>
          <div className="flex justify-center gap-2">
            <Link to="/import" className="btn-primary">
              Importer Discogs
            </Link>
            <Link to="/add" className="btn-outline">
              Ajout manuel
            </Link>
          </div>
        </div>
      ) : view === 'wall' ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {items.map((r) => (
            <ReleaseCard key={r.id} r={r} />
          ))}
        </div>
      ) : (
        <div className="crate no-scrollbar -mx-4 flex gap-6 overflow-x-auto px-4 py-8">
          {items.map((r) => (
            <Link
              key={r.id}
              to={`/release/${r.id}`}
              className="group w-64 shrink-0"
            >
              <div className="aspect-square overflow-hidden rounded-lg shadow-sleeve ring-1 ring-ink/10 transition-transform duration-200 group-hover:-translate-y-2 group-hover:rotate-1">
                <Cover src={r.coverUrl} title={r.title} artist={r.artistDisplay} />
              </div>
              <p className="mt-3 line-clamp-1 text-base font-semibold">{r.title}</p>
              <p className="line-clamp-1 text-sm text-mocha">
                {r.artistDisplay}
                {r.year ? ` · ${r.year}` : ''}
              </p>
            </Link>
          ))}
        </div>
      )}

      {data && data.pageCount > 1 && (
        <div className="mt-8 flex items-center justify-center gap-4">
          <button className="btn-outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ← Précédent
          </button>
          <span className="text-sm text-mocha">
            Page {data.page} / {data.pageCount}
          </span>
          <button
            className="btn-outline"
            disabled={page >= data.pageCount}
            onClick={() => setPage((p) => p + 1)}
          >
            Suivant →
          </button>
        </div>
      )}
    </div>
  );
}
