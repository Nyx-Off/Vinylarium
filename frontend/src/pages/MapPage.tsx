import { useNavigate } from 'react-router-dom';
import { useOrigins } from '../api/hooks';
import { Globe } from '../components/Globe';
import { Spinner } from '../components/Spinner';

export default function MapPage() {
  const { data: origins, isLoading } = useOrigins();
  const navigate = useNavigate();
  const list = origins ?? [];

  const select = (name: string) => navigate(`/search?country=${encodeURIComponent(name)}`);

  return (
    <div>
      <h1 className="font-display text-3xl font-bold">Carte des origines</h1>
      <p className="mb-6 text-sm text-mocha">
        Origine de pressage de votre collection. Fais tourner le globe, clique sur un point pour
        filtrer les disques de ce pays.
      </p>

      {isLoading ? (
        <Spinner />
      ) : list.length === 0 ? (
        <p className="text-mocha">
          Aucune information de pays pour l'instant — importez et enrichissez votre collection.
        </p>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
          <Globe origins={list} onSelect={select} />

          <div className="space-y-2">
            <h2 className="label">Pays</h2>
            <div className="space-y-1.5">
              {list.map((o) => (
                <button
                  key={o.code}
                  onClick={() => select(o.name)}
                  className="card flex w-full items-center justify-between gap-3 px-4 py-2 text-left transition-transform hover:-translate-y-0.5"
                >
                  <span className="font-medium">{o.name}</span>
                  <span className="font-display text-lg font-bold text-accent">{o.count}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
