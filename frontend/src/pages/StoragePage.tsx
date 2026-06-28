import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../api/client';
import { useFurniture, useRoom, useStorageLocations } from '../api/hooks';
import type { CellContents, Furniture, FurnitureType, ReleaseListResponse, Room } from '../api/types';
import { findSpawnFloor, findSpawnWallBack } from '../lib/furniture';

// three.js is heavy — keep it out of the initial bundle, load it with the page.
const StorageRoom3D = lazy(() => import('../components/StorageRoom3D'));

const TYPE_LABELS: Record<FurnitureType, string> = {
  CUBES: 'Cubes (Kallax)',
  CUBE: 'Cube (1 case)',
  TOWER: 'Tour vinyles',
  BAC: 'Bac',
  VITRINE: 'Vitrine',
  CHEVALET: 'Chevalet',
  SHELF: 'Étagère',
  FRAME: 'Cadre',
};
const TYPE_ICON: Record<FurnitureType, string> = {
  CUBES: '🟫',
  CUBE: '⬛',
  TOWER: '🗼',
  BAC: '🗄️',
  VITRINE: '🪟',
  CHEVALET: '🖼️',
  SHELF: '📚',
  FRAME: '🖼️',
};
const HAS_GRID: FurnitureType[] = ['CUBES', 'CUBE', 'TOWER', 'VITRINE', 'SHELF'];

export default function StoragePage() {
  const qc = useQueryClient();
  const { data: furnitureData } = useFurniture();
  const { data: roomData } = useRoom();

  const [items, setItems] = useState<Furniture[]>([]);
  const itemsRef = useRef<Furniture[]>([]);
  const [room, setRoom] = useState<Room>({ width: 6, depth: 5 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ furnitureId: string; x: number; y: number } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (furnitureData) {
      setItems(furnitureData);
      itemsRef.current = furnitureData;
    }
  }, [furnitureData]);
  useEffect(() => {
    if (roomData) setRoom(roomData);
  }, [roomData]);

  const selected = items.find((f) => f.id === selectedId) ?? null;

  const invalidate = (cells = false) => {
    qc.invalidateQueries({ queryKey: ['furniture'] });
    if (cells) {
      qc.invalidateQueries({ queryKey: ['facets'] });
      qc.invalidateQueries({ queryKey: ['cell'] });
    }
  };

  // ── Furniture ops ──────────────────────────────────────────────────────────
  async function addFurniture(type: FurnitureType) {
    setError('');
    try {
      // Spawn on a free spot so a new piece never lands inside an existing one.
      const spawn =
        type === 'FRAME'
          ? findSpawnWallBack(type, itemsRef.current, room, 1.4)
          : findSpawnFloor(type, itemsRef.current, room);
      const { data } = await api.post<Furniture>('/storage/furniture', { type, ...spawn });
      await qc.invalidateQueries({ queryKey: ['furniture'] });
      setSelectedCell(null);
      setSelectedId(data.id);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  function patchLocal(id: string, partial: Partial<Furniture>) {
    setItems((prev) => {
      const next = prev.map((f) => (f.id === id ? { ...f, ...partial } : f));
      itemsRef.current = next;
      return next;
    });
  }

  async function patchFurniture(id: string, partial: Partial<Furniture>, structural = false) {
    patchLocal(id, partial);
    try {
      await api.patch(`/storage/furniture/${id}`, partial);
      if (structural) invalidate();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function deleteFurniture(id: string) {
    if (!confirm('Supprimer ce meuble ? Les disques rangés dans ses cases ne seront plus localisés.')) return;
    await api.delete(`/storage/furniture/${id}`);
    if (selectedId === id) setSelectedId(null);
    setSelectedCell(null);
    invalidate(true);
  }

  const onDragMove = (id: string, pos: Partial<Furniture>) => patchLocal(id, pos);
  const onDragEnd = (id: string) => {
    const f = itemsRef.current.find((x) => x.id === id);
    if (f) api.patch(`/storage/furniture/${id}`, { posX: f.posX, posY: f.posY, posZ: f.posZ }).catch(() => {});
  };

  async function saveRoom(next: Room) {
    setRoom(next);
    try {
      await api.put('/storage/room', next);
      qc.invalidateQueries({ queryKey: ['storage-room'] });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Rangement</h1>
          <p className="text-sm text-mocha">
            Agencez vos meubles dans la pièce, redimensionnez-les, et cliquez une case pour y ranger des disques.
          </p>
        </div>
        <RoomControls room={room} onChange={saveRoom} />
      </div>

      {error && <p className="mb-2 text-sm text-accent">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="card overflow-hidden p-0">
          <div className="h-[74vh] min-h-[440px] w-full">
            <Suspense fallback={<div className="flex h-full items-center justify-center text-mocha">Chargement de la pièce 3D…</div>}>
              <StorageRoom3D
                furniture={items}
                room={room}
                selectedId={selectedId}
                onSelectFurniture={(id) => {
                  setSelectedId(id);
                  setSelectedCell(null);
                }}
                onSelectCell={(f, x, y) => {
                  setSelectedId(f.id);
                  setSelectedCell({ furnitureId: f.id, x, y });
                }}
                onDragMove={onDragMove}
                onDragEnd={onDragEnd}
              />
            </Suspense>
          </div>
          <p className="border-t border-sand/60 px-3 py-1.5 text-xs text-mocha">
            Glisser pour pivoter la vue · molette pour zoomer · glisser un meuble pour le déplacer · clic sur une case pour la remplir
          </p>
        </div>

        <aside className="space-y-4">
          <div className="card p-4">
            <h2 className="mb-2 font-display text-lg font-bold">Ajouter un meuble</h2>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(TYPE_LABELS) as FurnitureType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => addFurniture(t)}
                  className="btn-outline flex items-center gap-2 text-sm"
                >
                  <span>{TYPE_ICON[t]}</span> {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {selectedCell ? (
            <CellPanel
              furnitureId={selectedCell.furnitureId}
              x={selectedCell.x}
              y={selectedCell.y}
              furnitureName={items.find((f) => f.id === selectedCell.furnitureId)?.name ?? ''}
              onBack={() => setSelectedCell(null)}
              onChanged={() => invalidate(true)}
            />
          ) : selected ? (
            <FurnitureEditor
              f={selected}
              onPatch={patchFurniture}
              onDelete={() => deleteFurniture(selected.id)}
            />
          ) : (
            <div className="card p-4 text-sm text-mocha">
              Sélectionnez un meuble pour modifier sa taille, son agencement et sa grille de cases — ou ajoutez-en un.
            </div>
          )}

          <LegacyLocations />
        </aside>
      </div>
    </div>
  );
}

// ── Room size ─────────────────────────────────────────────────────────────────
function RoomControls({ room, onChange }: { room: Room; onChange: (r: Room) => void }) {
  return (
    <div className="flex items-end gap-2">
      <label className="text-xs text-mocha">
        Largeur pièce (m)
        <input
          type="number"
          min={1}
          max={50}
          step={0.5}
          className="input mt-0.5 w-24 py-1"
          value={room.width}
          onChange={(e) => onChange({ ...room, width: Number(e.target.value) || room.width })}
        />
      </label>
      <label className="text-xs text-mocha">
        Profondeur (m)
        <input
          type="number"
          min={1}
          max={50}
          step={0.5}
          className="input mt-0.5 w-24 py-1"
          value={room.depth}
          onChange={(e) => onChange({ ...room, depth: Number(e.target.value) || room.depth })}
        />
      </label>
    </div>
  );
}

// ── Furniture editor ───────────────────────────────────────────────────────────
function FurnitureEditor({
  f,
  onPatch,
  onDelete,
}: {
  f: Furniture;
  onPatch: (id: string, partial: Partial<Furniture>, structural?: boolean) => void;
  onDelete: () => void;
}) {
  const num = (key: keyof Furniture, label: string, step: number, min: number, max: number, structural = false) => (
    <label className="text-xs text-mocha">
      {label}
      <input
        type="number"
        className="input mt-0.5 py-1"
        step={step}
        min={min}
        max={max}
        value={f[key] as number}
        onChange={(e) => onPatch(f.id, { [key]: Number(e.target.value) } as Partial<Furniture>, structural)}
      />
    </label>
  );

  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold">{TYPE_LABELS[f.type]}</h2>
        <button onClick={onDelete} className="text-sm text-mocha hover:text-accent" title="Supprimer">
          🗑 Supprimer
        </button>
      </div>

      <label className="block text-xs text-mocha">
        Nom
        <input
          className="input mt-0.5 py-1"
          value={f.name}
          onChange={(e) => onPatch(f.id, { name: e.target.value })}
        />
      </label>

      <div className="grid grid-cols-3 gap-2">
        {num('width', 'Largeur', 0.05, 0.1, 20)}
        {num('height', 'Hauteur', 0.05, 0.1, 10)}
        {num('depth', 'Profondeur', 0.05, 0.05, 10)}
      </div>

      {HAS_GRID.includes(f.type) && (
        <div className="grid grid-cols-2 gap-2">
          {num('columns', 'Colonnes', 1, 1, 20, true)}
          {num('rows', 'Rangées', 1, 1, 20, true)}
        </div>
      )}

      <div>
        <label className="label !mb-1">Emplacement</label>
        <div className="flex gap-1">
          {(
            [
              ['FLOOR', 'Au sol'],
              ['WALL_BACK', 'Mur fond'],
              ['WALL_LEFT', 'Mur gauche'],
            ] as const
          ).map(([m, lbl]) => (
            <button
              key={m}
              onClick={() => onPatch(f.id, { mount: m, posY: m !== 'FLOOR' && f.posY < 0.5 ? 1.4 : f.posY }, true)}
              className={`flex-1 rounded-full px-2 py-1 text-xs ${f.mount === m ? 'bg-accent text-cream' : 'bg-ink/5 text-mocha hover:bg-ink/10'}`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="label !mb-1">Position (m)</label>
        <div className="grid grid-cols-3 gap-2">
          {num('posX', 'X (g/d)', 0.1, -25, 25)}
          {num('posY', 'Y (haut.)', 0.1, 0, 10)}
          {num('posZ', 'Z (av/arr)', 0.1, -25, 25)}
        </div>
        <p className="mt-1 text-[11px] text-mocha/70">Y = élévation : empiler un meuble ou le monter au mur.</p>
      </div>

      {f.mount === 'FLOOR' && (
        <div>
          <label className="text-xs text-mocha">Rotation : {Math.round(f.rotation)}°</label>
          <div className="mt-1 flex items-center gap-2">
            <button className="btn-outline px-2 py-1 text-sm" onClick={() => onPatch(f.id, { rotation: (f.rotation - 15 + 360) % 360 })}>
              ↺ -15°
            </button>
            <input
              type="range"
              min={0}
              max={360}
              step={1}
              className="flex-1"
              value={f.rotation}
              onChange={(e) => onPatch(f.id, { rotation: Number(e.target.value) })}
            />
            <button className="btn-outline px-2 py-1 text-sm" onClick={() => onPatch(f.id, { rotation: (f.rotation + 15) % 360 })}>
              ↻ +15°
            </button>
          </div>
        </div>
      )}

      <label className="flex items-center gap-2 text-xs text-mocha">
        Teinte du meuble
        <input
          type="color"
          value={f.color || '#6b4e34'}
          onChange={(e) => onPatch(f.id, { color: e.target.value })}
          className="h-7 w-10 rounded border border-sand"
        />
        {f.color && (
          <button className="text-accent hover:underline" onClick={() => onPatch(f.id, { color: null })}>
            réinitialiser
          </button>
        )}
      </label>
    </div>
  );
}

// ── Cell contents + assignment ───────────────────────────────────────────────
function CellPanel({
  furnitureId,
  x,
  y,
  furnitureName,
  onBack,
  onChanged,
}: {
  furnitureId: string;
  x: number;
  y: number;
  furnitureName: string;
  onBack: () => void;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const cellKey = ['cell', furnitureId, x, y];
  const { data, isLoading } = useQuery({
    queryKey: cellKey,
    queryFn: async () =>
      (await api.get<CellContents>(`/storage/furniture/${furnitureId}/cells/${x}/${y}`)).data,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: cellKey });
    onChanged();
  };

  async function assign(releaseId: string) {
    await api.post(`/storage/furniture/${furnitureId}/cells/${x}/${y}/releases`, { releaseId });
    refresh();
  }
  async function unassign(releaseId: string) {
    await api.delete(`/storage/furniture/${furnitureId}/cells/${x}/${y}/releases/${releaseId}`);
    refresh();
  }

  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold">
          Case C{x + 1}·R{y + 1}
        </h2>
        <button onClick={onBack} className="text-sm text-mocha hover:text-accent">
          ← {furnitureName}
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-mocha">Chargement…</p>
      ) : (
        <>
          {data && data.releases.length > 0 ? (
            <ul className="space-y-1.5">
              {data.releases.map((r) => (
                <li key={r.id} className="flex items-center gap-2">
                  {r.coverUrl ? (
                    <img src={r.coverUrl} alt="" className="h-9 w-9 rounded object-cover" />
                  ) : (
                    <div className="h-9 w-9 rounded bg-sand" />
                  )}
                  <div className="min-w-0 flex-1">
                    <Link to={`/release/${r.id}`} className="block truncate text-sm hover:text-accent">
                      {r.title}
                    </Link>
                    <p className="truncate text-xs text-mocha">{r.artistDisplay}</p>
                  </div>
                  <button onClick={() => unassign(r.id)} className="text-mocha hover:text-accent" title="Retirer">
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-mocha">Case vide.</p>
          )}

          <ReleasePicker onPick={assign} />
        </>
      )}
    </div>
  );
}

function ReleasePicker({ onPick }: { onPick: (releaseId: string) => void }) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const { data } = useQuery({
    enabled: debounced.length >= 2,
    queryKey: ['rel-search', debounced],
    queryFn: async () =>
      (
        await api.get<ReleaseListResponse>('/releases', {
          params: { q: debounced, pageSize: 10, includeHidden: true },
        })
      ).data,
  });

  return (
    <div className="border-t border-sand/60 pt-2">
      <label className="label">Ranger un disque ici</label>
      <input
        className="input"
        placeholder="Rechercher un disque…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {data && data.items.length > 0 && (
        <ul className="mt-2 max-h-56 space-y-1 overflow-auto">
          {data.items.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => {
                  onPick(r.id);
                  setQ('');
                }}
                className="flex w-full items-center gap-2 rounded p-1 text-left hover:bg-sand/40"
              >
                {r.coverUrl ? (
                  <img src={r.coverUrl} alt="" className="h-8 w-8 rounded object-cover" />
                ) : (
                  <div className="h-8 w-8 rounded bg-sand" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{r.title}</span>
                  <span className="block truncate text-xs text-mocha">{r.artistDisplay}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Legacy text locations (kept for the non-3D workflow) ──────────────────────
function LegacyLocations() {
  const qc = useQueryClient();
  const { data: locations } = useStorageLocations();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['storage'] });
    qc.invalidateQueries({ queryKey: ['facets'] });
  };

  async function create() {
    if (!label.trim()) return;
    await api.post('/storage', { label: label.trim() });
    setLabel('');
    refresh();
  }
  async function remove(id: string) {
    if (!confirm('Supprimer cet emplacement ?')) return;
    await api.delete(`/storage/${id}`);
    refresh();
  }

  return (
    <div className="card p-4">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between text-sm font-semibold">
        Emplacements libres (texte)
        <span>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          {locations && locations.length > 0 ? (
            locations.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-2 text-sm">
                <Link to={`/search?storageLocationId=${l.id}`} className="truncate hover:text-accent">
                  {l.label} <span className="text-xs text-mocha">({l.releaseCount})</span>
                </Link>
                <button onClick={() => remove(l.id)} className="text-mocha hover:text-accent">
                  ✕
                </button>
              </div>
            ))
          ) : (
            <p className="text-xs text-mocha">Aucun emplacement texte.</p>
          )}
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder="Nouvel emplacement…"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            <button onClick={create} className="btn-outline text-sm">
              +
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
