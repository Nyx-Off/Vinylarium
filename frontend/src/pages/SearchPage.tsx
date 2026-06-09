import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useFacets, useReleases, ReleaseFilters } from '../api/hooks';
import { ReleaseCard } from '../components/ReleaseCard';
import { Spinner } from '../components/Spinner';

const FLAG_FILTERS: { key: keyof ReleaseFilters; label: string }[] = [
  { key: 'live', label: 'Live' },
  { key: 'studio', label: 'Studio' },
  { key: 'compilation', label: 'Compilation' },
  { key: 'special', label: 'Édition spéciale' },
  { key: 'reissue', label: 'Réédition' },
  { key: 'remaster', label: 'Remaster' },
];

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const { data: facets } = useFacets();

  const initial = useMemo<ReleaseFilters>(
    () => ({
      q: params.get('q') || undefined,
      artistId: params.get('artistId') || undefined,
      role: params.get('role') || undefined,
      genre: params.get('genre') || undefined,
      style: params.get('style') || undefined,
      country: params.get('country') || undefined,
      label: params.get('label') || undefined,
      tag: params.get('tag') || undefined,
      decade: params.get('decade') ? Number(params.get('decade')) : undefined,
      storageLocationId: params.get('storageLocationId') || undefined,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [filters, setFilters] = useState<ReleaseFilters>({ ...initial, sort: 'addedDesc', page: 1, pageSize: 60 });
  const { data, isLoading, isFetching } = useReleases(filters);

  function set<K extends keyof ReleaseFilters>(key: K, value: ReleaseFilters[K]) {
    setFilters((f) => ({ ...f, [key]: value || undefined, page: 1 }));
  }

  function reset() {
    setFilters({ sort: 'addedDesc', page: 1, pageSize: 60 });
    setParams({});
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
            defaultValue={filters.q ?? ''}
            onChange={(e) => set('q', e.target.value)}
          />
        </div>

        {filters.artistId && (
          <div className="chip chip-active w-full justify-between">
            Artiste sélectionné
            <button onClick={() => set('artistId', undefined)}>✕</button>
          </div>
        )}

        <FacetSelect label="Genre" value={filters.genre} options={facets?.genres} onChange={(v) => set('genre', v)} />
        <FacetSelect label="Style" value={filters.style} options={facets?.styles} onChange={(v) => set('style', v)} />
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
            onChange={(e) => set('decade', e.target.value ? Number(e.target.value) : undefined)}
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
          <label className="label">Version</label>
          <div className="flex flex-wrap gap-1.5">
            {FLAG_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => set(f.key, (!filters[f.key] || undefined) as never)}
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
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-mocha">
            {data ? `${data.total} résultat${data.total > 1 ? 's' : ''}` : '…'}
            {isFetching && ' · …'}
          </p>
          <select
            className="input w-40"
            value={filters.sort}
            onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value, page: 1 }))}
          >
            <option value="addedDesc">Ajout récent</option>
            <option value="title">Titre A→Z</option>
            <option value="artist">Artiste A→Z</option>
            <option value="yearAsc">Année ↑</option>
            <option value="yearDesc">Année ↓</option>
          </select>
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
            {data.pageCount > 1 && (
              <div className="mt-8 flex items-center justify-center gap-4">
                <button
                  className="btn-outline"
                  disabled={(filters.page ?? 1) <= 1}
                  onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
                >
                  ← Précédent
                </button>
                <span className="text-sm text-mocha">
                  {data.page} / {data.pageCount}
                </span>
                <button
                  className="btn-outline"
                  disabled={(filters.page ?? 1) >= data.pageCount}
                  onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
                >
                  Suivant →
                </button>
              </div>
            )}
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
