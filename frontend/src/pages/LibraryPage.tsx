import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
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
import { useFeatures } from '../lib/features';
import { useState } from 'react';

// Each library view maps to the feature flag that can hide it.
const VIEW_FEATURE = { wall: 'viewWall', crate: 'viewCrate', pile: 'viewPile' } as const;
const ALL_VIEWS = ['wall', 'crate', 'pile'] as const;
type LibraryView = (typeof ALL_VIEWS)[number];

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
  const features = useFeatures();
  const enabledViews = ALL_VIEWS.filter((v) => features[VIEW_FEATURE[v]]);
  const viewParam = params.get('view');
  const requestedView: LibraryView =
    viewParam === 'crate' || viewParam === 'pile' ? viewParam : 'wall';
  // Fall back to the first enabled view when the URL asks for a disabled one
  // (e.g. ?view=pile after this profile turned the pile view off).
  const view: LibraryView = enabledViews.includes(requestedView)
    ? requestedView
    : enabledViews[0] ?? 'wall';
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
  const qc = useQueryClient();
  const [pick, setPick] = useState<ReleaseListItem | null>(null);
  const [rolling, setRolling] = useState(false);

  // Bulk multi-select (wall view only).
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  function exitSelect() {
    setSelectMode(false);
    setSelected(new Set());
  }
  async function runBulk(action: 'hide' | 'unhide' | 'addTag' | 'removeTag') {
    if (selected.size === 0 || bulkBusy) return;
    let tag: string | undefined;
    if (action === 'addTag' || action === 'removeTag') {
      const input = window.prompt(
        action === 'addTag' ? 'Tag à ajouter aux disques sélectionnés :' : 'Tag à retirer :',
      );
      if (!input?.trim()) return;
      tag = input.trim();
    }
    setBulkBusy(true);
    try {
      await api.post('/releases/bulk', { ids: [...selected], action, tag });
      await qc.invalidateQueries({ queryKey: ['releases'] });
      exitSelect();
    } finally {
      setBulkBusy(false);
    }
  }

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
          {enabledViews.length > 1 && (
            <div className="flex overflow-hidden rounded-full border border-ink/15">
              {enabledViews.includes('wall') && (
                <button
                  className={`px-3 py-1.5 text-sm ${view === 'wall' ? 'bg-accent text-cream' : 'text-mocha'}`}
                  onClick={() => patch({ view: null })}
                >
                  Mur
                </button>
              )}
              {enabledViews.includes('crate') && (
                <button
                  className={`px-3 py-1.5 text-sm ${view === 'crate' ? 'bg-accent text-cream' : 'text-mocha'}`}
                  onClick={() => patch({ view: 'crate' })}
                >
                  Bac
                </button>
              )}
              {enabledViews.includes('pile') && (
                <button
                  className={`px-3 py-1.5 text-sm ${view === 'pile' ? 'bg-accent text-cream' : 'text-mocha'}`}
                  onClick={() => patch({ view: 'pile' })}
                >
                  Pile
                </button>
              )}
            </div>
          )}
          {features.random && (
            <button
              onClick={pickRandom}
              className="rounded-full bg-ink/5 px-3 py-1.5 text-sm font-medium text-mocha hover:bg-ink/10"
              title="Choisir un disque au hasard"
            >
              🎲 Au hasard
            </button>
          )}
          {view === 'wall' && (
            <button
              onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${selectMode ? 'bg-accent text-cream' : 'bg-ink/5 text-mocha hover:bg-ink/10'}`}
              title="Sélectionner plusieurs disques"
            >
              {selectMode ? 'Terminer' : '☑︎ Sélectionner'}
            </button>
          )}
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
            <ReleaseCard
              key={r.id}
              r={r}
              selectable={selectMode}
              selected={selected.has(r.id)}
              onToggleSelect={toggleSelect}
            />
          ))}
        </div>
      ) : view === 'pile' ? (
        <PileBrowser items={items} filter={q} />
      ) : (
        <CrateBrowser items={items} sortHint={sort} />
      )}

      {selectMode && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink/10 bg-cream/95 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur md:bottom-4 md:left-1/2 md:right-auto md:-translate-x-1/2 md:rounded-full md:border md:shadow-xl">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-2 text-sm">
            <span className="font-medium">{selected.size} sélectionné{selected.size > 1 ? 's' : ''}</span>
            <button
              onClick={() => setSelected(new Set(items.map((r) => r.id)))}
              className="btn-ghost px-2 text-xs"
            >
              Tout (page)
            </button>
            <button onClick={() => setSelected(new Set())} className="btn-ghost px-2 text-xs">
              Aucun
            </button>
            <span className="mx-1 h-4 w-px bg-ink/15" />
            <button onClick={() => runBulk('hide')} disabled={bulkBusy || !selected.size} className="btn-outline text-xs">
              Masquer
            </button>
            <button onClick={() => runBulk('unhide')} disabled={bulkBusy || !selected.size} className="btn-outline text-xs">
              Afficher
            </button>
            <button onClick={() => runBulk('addTag')} disabled={bulkBusy || !selected.size} className="btn-outline text-xs">
              + Tag
            </button>
            <button onClick={() => runBulk('removeTag')} disabled={bulkBusy || !selected.size} className="btn-outline text-xs">
              − Tag
            </button>
          </div>
        </div>
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
