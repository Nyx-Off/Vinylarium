import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useReleases } from '../api/hooks';
import { api } from '../api/client';
import { ReleaseCard } from '../components/ReleaseCard';
import { CrateBrowser } from '../components/CrateBrowser';
import { RandomRoulette } from '../components/RandomRoulette';
import { Spinner } from '../components/Spinner';
import { ReleaseListItem } from '../api/types';

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
  const navigate = useNavigate();
  const [pick, setPick] = useState<ReleaseListItem | null>(null);
  const [rolling, setRolling] = useState(false);

  async function pickRandom() {
    if (rolling) return;
    try {
      const { data } = await api.get<ReleaseListItem>('/releases/random');
      setPick(data);
      setRolling(true);
    } catch {
      /* empty collection */
    }
  }

  // Crate view shows the whole collection as one floor of bins — no paging.
  const { data, isLoading, isFetching } = useReleases(
    view === 'crate'
      ? { q: q || undefined, sort, page: 1, pageSize: 1000 }
      : { q: q || undefined, sort, page, pageSize: 60 },
  );

  const items = data?.items ?? [];

  return (
    <div>
      {rolling && pick && (
        <RandomRoulette
          pool={items}
          pick={pick}
          onGo={(id) => {
            setRolling(false);
            navigate(`/release/${id}`);
          }}
          onCancel={() => setRolling(false)}
        />
      )}
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
          <button
            onClick={pickRandom}
            className="rounded-full bg-ink/5 px-3 py-1.5 text-sm font-medium text-mocha hover:bg-ink/10"
            title="Choisir un disque au hasard"
          >
            🎲 Au hasard
          </button>
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
        <CrateBrowser items={items} sortHint={sort} />
      )}

      {view !== 'crate' && data && data.pageCount > 1 && (
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
