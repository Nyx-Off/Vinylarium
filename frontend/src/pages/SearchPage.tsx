import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useFacets, useReleases, ReleaseFilters } from '../api/hooks';
import { ReleaseCard } from '../components/ReleaseCard';
import { Spinner } from '../components/Spinner';
import {
  ALLOWED_PAGE_SIZES,
  DEFAULT_PAGE_SIZE,
  PageSizeSelect,
  Pagination,
} from '../components/Pagination';

const FLAG_FILTERS: { key: keyof ReleaseFilters; label: string }[] = [
  { key: 'live', label: 'Live' },
  { key: 'studio', label: 'Studio' },
  { key: 'compilation', label: 'Compilation' },
  { key: 'special', label: 'Édition spéciale' },
  { key: 'reissue', label: 'Réédition' },
  { key: 'remaster', label: 'Remaster' },
  { key: 'hidden', label: 'Masqués' },
];

// "Sans année", "sans pochette"… — releases missing a piece of information.
const MISSING_FILTERS: { key: string; label: string }[] = [
  { key: 'year', label: 'Sans année' },
  { key: 'cover', label: 'Sans pochette' },
  { key: 'lyrics', label: 'Sans paroles' },
  { key: 'country', label: 'Sans pays' },
  { key: 'genre', label: 'Sans genre' },
  { key: 'storage', label: 'Sans rangement' },
  { key: 'rating', label: 'Sans note' },
  { key: 'credits', label: 'Sans crédits' },
  { key: 'tracklist', label: 'Sans tracklist' },
];

const STRING_KEYS = [
  'q',
  'artistId',
  'role',
  'genre',
  'style',
  'label',
  'country',
  'origin',
  'tag',
  'format',
  'storageLocationId',
  'missing',
] as const;
const FLAG_KEYS = ['live', 'studio', 'compilation', 'special', 'reissue', 'remaster', 'hidden'] as const;

export default function SearchPage() {
  // The whole search state lives in the URL: the back button restores the
  // exact page/filters, and a search can be shared as a link.
  const [params, setParams] = useSearchParams();

  const filters = useMemo<ReleaseFilters>(() => {
    const f: ReleaseFilters = {
      sort: params.get('sort') ?? 'addedDesc',
      page: Math.max(1, parseInt(params.get('page') ?? '1', 10) || 1),
    };
    const sizeParam = parseInt(params.get('pageSize') ?? '', 10);
    f.pageSize = ALLOWED_PAGE_SIZES.includes(sizeParam) ? sizeParam : DEFAULT_PAGE_SIZE;
    for (const k of STRING_KEYS) {
      const v = params.get(k);
      if (v) f[k] = v;
    }
    const decade = params.get('decade');
    if (decade) f.decade = Number(decade);
    for (const k of FLAG_KEYS) {
      if (params.get(k)) f[k] = true;
    }
    return f;
  }, [params]);

  // Hidden releases stay searchable: they are mixed into every search result
  // (the library alone excludes them); the "Masqués" chip narrows to them.
  const { data, isLoading, isFetching } = useReleases({ ...filters, includeHidden: true });
  const { data: facets } = useFacets();

  function patch(changes: Record<string, string | null>, resetPage = true) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (resetPage) next.delete('page');
        for (const [k, v] of Object.entries(changes)) {
          if (v === null || v === '') next.delete(k);
          else next.set(k, v);
        }
        return next;
      },
      { replace: true },
    );
  }

  function set(key: string, value: string | undefined) {
    patch({ [key]: value ?? null });
  }

  function reset() {
    setParams({}, { replace: true });
  }

  const activeCount = Object.entries(filters).filter(
    ([k, v]) => !['sort', 'page', 'pageSize'].includes(k) && v,
  ).length;

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      {/* Filter panel */}
      <aside className="card h-fit space-y-4 p-5 lg:sticky lg:top-20">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold">Recherche</h1>
          {activeCount > 0 && (
            <button onClick={reset} className="text-xs text-accent hover:underline">
              Réinitialiser
            </button>
          )}
        </div>

        <div>
          <label className="label">Mots-clés</label>
          <input
            className="input"
            placeholder="titre, artiste, note…"
            value={filters.q ?? ''}
            onChange={(e) => set('q', e.target.value)}
          />
        </div>

        {filters.artistId && (
          <div className="chip chip-active w-full justify-between">
            Artiste sélectionné
            <button onClick={() => set('artistId', undefined)}>✕</button>
          </div>
        )}

        {filters.origin && (
          <div className="chip chip-active w-full justify-between">
            Artistes originaires de : {filters.origin}
            <button onClick={() => set('origin', undefined)}>✕</button>
          </div>
        )}

        <FacetSelect label="Genre" value={filters.genre} options={facets?.genres} onChange={(v) => set('genre', v)} />
        <FacetSelect label="Style" value={filters.style} options={facets?.styles} onChange={(v) => set('style', v)} />
        <FacetSelect
          label="Format (33/45, LP/EP…)"
          value={filters.format}
          options={facets?.formats}
          onChange={(v) => set('format', v)}
        />
        <FacetSelect label="Label" value={filters.label} options={facets?.labels} onChange={(v) => set('label', v)} />
        <FacetSelect label="Pays" value={filters.country} options={facets?.countries} onChange={(v) => set('country', v)} />
        <FacetSelect
          label="Instrument (joue de…)"
          value={filters.role}
          options={facets?.instruments?.map((i) => ({ name: i.name, count: i.count }))}
          onChange={(v) => set('role', v)}
        />
        <FacetSelect label="Tag" value={filters.tag} options={facets?.tags} onChange={(v) => set('tag', v)} />

        <div>
          <label className="label">Décennie</label>
          <select
            className="input"
            value={filters.decade ?? ''}
            onChange={(e) => set('decade', e.target.value || undefined)}
          >
            <option value="">Toutes</option>
            {(facets?.decades ?? []).map((d) => (
              <option key={d.decade} value={d.decade}>
                {d.decade}s ({d.count})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Données manquantes</label>
          <div className="flex flex-wrap gap-1.5">
            {MISSING_FILTERS.map((m) => {
              const selected = (filters.missing ?? '').split(',').filter(Boolean);
              const active = selected.includes(m.key);
              return (
                <button
                  key={m.key}
                  onClick={() => {
                    const next = active
                      ? selected.filter((k) => k !== m.key)
                      : [...selected, m.key];
                    set('missing', next.length ? next.join(',') : undefined);
                  }}
                  className={`chip ${active ? 'chip-active' : ''}`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="label">Version</label>
          <div className="flex flex-wrap gap-1.5">
            {FLAG_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => set(f.key, filters[f.key] ? undefined : '1')}
                className={`chip ${filters[f.key] ? 'chip-active' : ''}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* Results */}
      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-mocha">
            {data ? `${data.total} résultat${data.total > 1 ? 's' : ''}` : '…'}
            {isFetching && ' · …'}
          </p>
          <div className="flex items-center gap-2">
            <PageSizeSelect
              value={filters.pageSize ?? DEFAULT_PAGE_SIZE}
              onChange={(n) => patch({ pageSize: String(n) })}
            />
            <select
              className="input w-40"
              value={filters.sort}
              onChange={(e) => patch({ sort: e.target.value })}
            >
              <option value="addedDesc">Ajout récent</option>
              <option value="title">Titre A→Z</option>
              <option value="titleDesc">Titre Z→A</option>
              <option value="artist">Artiste A→Z</option>
              <option value="artistDesc">Artiste Z→A</option>
              <option value="yearAsc">Année ↑</option>
              <option value="yearDesc">Année ↓</option>
            </select>
          </div>
        </div>

        {isLoading ? (
          <Spinner />
        ) : data && data.items.length > 0 ? (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {data.items.map((r) => (
                <ReleaseCard key={r.id} r={r} />
              ))}
            </div>
            <Pagination
              page={data.page}
              pageCount={data.pageCount}
              onPage={(p) => {
                patch({ page: p <= 1 ? null : String(p) }, false);
                window.scrollTo({ top: 0 });
              }}
            />
          </>
        ) : (
          <p className="py-16 text-center text-mocha">Aucun disque ne correspond à ces critères.</p>
        )}
      </div>
    </div>
  );
}

function FacetSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value?: string;
  options?: { name: string; count: number }[];
  onChange: (v: string | undefined) => void;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <select className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">Tous</option>
        {(options ?? []).map((o) => (
          <option key={o.name} value={o.name}>
            {o.name} ({o.count})
          </option>
        ))}
      </select>
    </div>
  );
}
