import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { usePublicReleases, usePublicShareInfo } from '../api/hooks';
import { Cover } from '../components/Cover';
import { Spinner } from '../components/Spinner';
import { Disc } from '../components/Layout';
import { DEFAULT_PAGE_SIZE, Pagination } from '../components/Pagination';

const SORTS = [
  { value: 'addedDesc', label: 'Ajout récent' },
  { value: 'artist', label: 'Artiste A→Z' },
  { value: 'title', label: 'Titre A→Z' },
  { value: 'yearAsc', label: 'Année ↑' },
  { value: 'yearDesc', label: 'Année ↓' },
];

export default function SharePage() {
  const { token } = useParams();
  const { data: info, isLoading: infoLoading, isError } = usePublicShareInfo(token);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('addedDesc');
  const [page, setPage] = useState(1);
  const { data, isLoading } = usePublicReleases(isError ? undefined : token, {
    q: q || undefined,
    sort,
    page,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  if (infoLoading) return <Spinner label="Chargement…" />;

  if (isError || !info) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="card max-w-md p-8 text-center">
          <h1 className="mb-2 font-display text-2xl font-bold">Lien indisponible</h1>
          <p className="text-sm text-mocha">
            Ce lien de partage n'est plus valide ou a été désactivé par son propriétaire.
          </p>
        </div>
      </div>
    );
  }

  const items = data?.items ?? [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <header className="mb-6 flex items-center gap-2">
        <Disc />
        <div>
          <h1 className="font-display text-2xl font-bold">{info.name}</h1>
          <p className="text-xs text-mocha">
            Collection partagée · {info.total} disque{info.total > 1 ? 's' : ''} · lecture seule
          </p>
        </div>
      </header>

      <div className="mb-5 flex flex-wrap items-center gap-2">
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
      </div>

      {isLoading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <p className="py-16 text-center text-mocha">Aucun disque.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {items.map((r) => (
              <Link key={r.id} to={`/share/${token}/release/${r.id}`} className="group block">
                <div className="relative aspect-square overflow-hidden rounded-xl shadow-sleeve ring-1 ring-ink/10 transition-transform duration-200 group-hover:-translate-y-1">
                  <Cover src={r.coverUrl} title={r.title} artist={r.artistDisplay} />
                </div>
                <div className="mt-2 px-0.5">
                  <p className="line-clamp-1 text-sm font-semibold">{r.title}</p>
                  <p className="line-clamp-1 text-xs text-mocha">
                    {r.artistDisplay}
                    {r.year ? ` · ${r.year}` : ''}
                  </p>
                </div>
              </Link>
            ))}
          </div>
          {data && (
            <Pagination
              page={data.page}
              pageCount={data.pageCount}
              onPage={(p) => {
                setPage(p);
                window.scrollTo({ top: 0 });
              }}
            />
          )}
        </>
      )}
      <footer className="mt-10 text-center text-xs text-mocha/60">Propulsé par Vinylarium</footer>
    </div>
  );
}
