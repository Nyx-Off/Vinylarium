import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useReleases } from '../api/hooks';
import { api } from '../api/client';
import { ReleaseCard } from '../components/ReleaseCard';
import { CrateBrowser } from '../components/CrateBrowser';
import { PileBrowser } from '../components/PileBrowser';
import { RandomRoulette } from '../components/RandomRoulette';
import { Spinner } from '../components/Spinner';
import {
  ALLOWED_PAGE_SIZES,
  DEFAULT_PAGE_SIZE,
  PageSizeSelect,
  Pagination,
} from '../components/Pagination';
import { ReleaseListItem } from '../api/types';
import { useState } from 'react';

const SORTS = [
  { value: 'addedDesc', label: 'Ajout récent' },
  { value: 'title', label: 'Titre A→Z' },
  { value: 'titleDesc', label: 'Titre Z→A' },
  { value: 'artist', label: 'Artiste A→Z' },
  { value: 'artistDesc', label: 'Artiste Z→A' },
  { value: 'yearAsc', label: 'Année ↑' },
  { value: 'yearDesc', label: 'Année ↓' },
  { value: 'ratingDesc', label: 'Note ↓' },
];

export default function LibraryPage() {
  // Everything that defines "what am I looking at" lives in the URL, so the
  // browser back button (e.g. from a release sheet) restores page 4 of the
  // wall instead of dumping back on page 1.
  const [params, setParams] = useSearchParams();
  const viewParam = params.get('view');
  const view = viewParam === 'crate' || viewParam === 'pile' ? viewParam : 'wall';
  const sort = params.get('sort') ?? 'addedDesc';
  const q = params.get('q') ?? '';
  const page = Math.max(1, parseInt(params.get('page') ?? '1', 10) || 1);
  const sizeParam = parseInt(params.get('pageSize') ?? '', 10);
  const pageSize = ALLOWED_PAGE_SIZES.includes(sizeParam) ? sizeParam : DEFAULT_PAGE_SIZE;

  // replace:true — one history entry for the library, always carrying the
  // latest view state.
  function patch(changes: Record<string, string | null>) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(changes)) {
          if (v === null || v === '') next.delete(k);
          else next.set(k, v);
        }
        return next;
      },
      { replace: true },
    );
  }

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

  // Crate & pile views show the whole collection at once — no paging. The
  // pile view filters by ARTIST client-side (the search box becomes an
  // artist finder), so q is not sent to the API there.
  const { data, isLoading, isFetching } = useReleases(
    view === 'crate' || view === 'pile'
      ? { q: view === 'pile' ? undefined : q || undefined, sort, page: 1, pageSize: 1000 }
      : { q: q || undefined, sort, page, pageSize },
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
            placeholder={view === 'pile' ? 'Trouver un artiste…' : 'Rechercher…'}
            value={q}
            onChange={(e) => patch({ q: e.target.value, page: null })}
          />
          <select
            className="input w-40"
            value={sort}
            onChange={(e) => patch({ sort: e.target.value, page: null })}
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          {view === 'wall' && (
            <PageSizeSelect value={pageSize} onChange={(n) => patch({ pageSize: String(n), page: null })} />
          )}
          <div className="flex overflow-hidden rounded-full border border-ink/15">
            <button
              className={`px-3 py-1.5 text-sm ${view === 'wall' ? 'bg-accent text-cream' : 'text-mocha'}`}
              onClick={() => patch({ view: null })}
            >
              Mur
            </button>
            <button
              className={`px-3 py-1.5 text-sm ${view === 'crate' ? 'bg-accent text-cream' : 'text-mocha'}`}
              onClick={() => patch({ view: 'crate' })}
            >
              Bac
            </button>
            <button
              className={`px-3 py-1.5 text-sm ${view === 'pile' ? 'bg-accent text-cream' : 'text-mocha'}`}
              onClick={() => patch({ view: 'pile' })}
            >
              Pile
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
            Récupérez votre collection Discogs depuis les paramètres ou ajoutez un disque.
          </p>
          <div className="flex justify-center gap-2">
            <Link to="/settings" className="btn-primary">
              Paramètres
            </Link>
            <Link to="/add" className="btn-outline">
              Ajouter un disque
            </Link>
          </div>
        </div>
      ) : view === 'wall' ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {items.map((r) => (
            <ReleaseCard key={r.id} r={r} />
          ))}
        </div>
      ) : view === 'pile' ? (
        <PileBrowser items={items} filter={q} />
      ) : (
        <CrateBrowser items={items} sortHint={sort} />
      )}

      {view === 'wall' && data && (
        <Pagination
          page={data.page}
          pageCount={data.pageCount}
          onPage={(p) => {
            patch({ page: p <= 1 ? null : String(p) });
            window.scrollTo({ top: 0 });
          }}
        />
      )}
    </div>
  );
}
