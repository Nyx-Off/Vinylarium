import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrigins } from '../api/hooks';
import { OriginMode } from '../api/types';
import { Globe } from '../components/Globe';
import { Spinner } from '../components/Spinner';

const MODES: { key: OriginMode; label: string; hint: string }[] = [
  {
    key: 'artists',
    label: 'Artistes',
    hint: "D'où viennent les artistes et groupes de votre collection (via MusicBrainz).",
  },
  {
    key: 'pressing',
    label: 'Pressage',
    hint: 'Pays où vos vinyles ont été pressés (donnée Discogs).',
  },
];

export default function MapPage() {
  const [mode, setMode] = useState<OriginMode>('artists');
  const { data, isLoading } = useOrigins(mode);
  const navigate = useNavigate();
  const list = data?.origins ?? [];

  const select = (o: { name: string; code: string }) =>
    mode === 'artists'
      ? navigate(`/search?origin=${encodeURIComponent(o.code)}`)
      : navigate(`/search?country=${encodeURIComponent(o.name)}`);

  const current = MODES.find((m) => m.key === mode)!;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-bold">Carte des origines</h1>
        <div className="flex gap-1.5">
          {MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={`chip ${mode === m.key ? 'chip-active' : 'hover:bg-ink/10'}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <p className="mb-1 mt-1 text-sm text-mocha">
        {current.hint} Fais tourner le globe, clique sur un point pour filtrer les disques.
      </p>
      {mode === 'artists' && (data?.artistsPending ?? 0) > 0 && (
        <p className="mb-4 text-xs text-mocha/70">
          ⏳ {data!.artistsPending} artiste{data!.artistsPending > 1 ? 's' : ''} encore en cours de
          géolocalisation — la carte se complète au fil de l'eau.
        </p>
      )}

      {isLoading ? (
        <Spinner />
      ) : list.length === 0 ? (
        <p className="mt-6 text-mocha">
          {mode === 'artists'
            ? "Aucune origine d'artiste résolue pour l'instant — le worker interroge MusicBrainz en arrière-plan, repassez dans quelques minutes."
            : "Aucune information de pays pour l'instant — importez et enrichissez votre collection."}
        </p>
      ) : (
        <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_280px]">
          <Globe origins={list} onSelect={(o) => select(o)} />

          <div className="space-y-2">
            <h2 className="label">Pays</h2>
            <div className="space-y-1.5">
              {list.map((o) => (
                <button
                  key={o.code}
                  onClick={() => select(o)}
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
