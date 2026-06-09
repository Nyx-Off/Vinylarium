import { Link } from 'react-router-dom';
import { useFacets } from '../api/hooks';
import { Spinner } from '../components/Spinner';

export default function MapPage() {
  const { data: facets, isLoading } = useFacets();
  const countries = facets?.countries ?? [];
  const max = countries.reduce((m, c) => Math.max(m, c.count), 1);

  return (
    <div>
      <h1 className="font-display text-3xl font-bold">Carte des origines</h1>
      <p className="mb-6 text-sm text-mocha">
        Répartition de la collection par pays de pressage. Le globe interactif et l'origine des
        artistes (via MusicBrainz) arrivent dans une prochaine version.
      </p>

      {isLoading ? (
        <Spinner />
      ) : countries.length === 0 ? (
        <p className="text-mocha">Aucune information de pays pour l'instant — importez votre collection.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {countries.map((c) => (
            <Link
              key={c.name}
              to={`/search?country=${encodeURIComponent(c.name)}`}
              className="card flex items-center justify-between gap-3 p-4 transition-transform hover:-translate-y-0.5"
            >
              <div className="flex-1">
                <p className="font-semibold">{c.name}</p>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
                  <div className="h-full bg-accent" style={{ width: `${(c.count / max) * 100}%` }} />
                </div>
              </div>
              <span className="font-display text-2xl font-bold text-accent">{c.count}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
