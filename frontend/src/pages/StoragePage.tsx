import { Suspense, lazy, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../api/client';
import { useFurniture, useRoom, useStorageLocations } from '../api/hooks';
import type { CellContents, Furniture, FurnitureType, ReleaseListResponse, Room } from '../api/types';
import { cellLabel, findSpawnFloor, findSpawnWallBack } from '../lib/furniture';

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
  const [focus, setFocus] = useState<{ id: string; x: number; y: number; nonce: number; coverUrl?: string; label?: string } | null>(null);
  const [error, setError] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (furnitureData) {
      setItems(furnitureData);
      itemsRef.current = furnitureData;
    }
  }, [furnitureData]);
  useEffect(() => {
    if (roomData) setRoom(roomData);
  }, [roomData]);

  // Deep link from a release sheet: ?locate=<storageLocationId> selects the
  // furniture + cell holding that disc and frames the camera on it.
  useEffect(() => {
    const locate = searchParams.get('locate');
    if (!locate || items.length === 0) return;
    const coverUrl = searchParams.get('cover') || undefined;
    for (const f of items) {
      const cell = f.cells.find((c) => c.id === locate);
      if (cell) {
        setSelectedId(f.id);
        setSelectedCell({ furnitureId: f.id, x: cell.cellX, y: cell.cellY });
        // "emplacement N" = the disc's left-to-right position in the cell.
        const idx = coverUrl ? cell.covers.indexOf(coverUrl) : -1;
        const base = cellLabel(f, cell.cellX, cell.cellY);
        const label = idx >= 0 ? `${base} · emplacement ${idx + 1}` : base;
        setFocus({ id: f.id, x: cell.cellX, y: cell.cellY, nonce: Date.now(), coverUrl, label });
        break;
      }
    }
    const next = new URLSearchParams(searchParams);
    next.delete('locate');
    next.delete('cover');
    setSearchParams(next, { replace: true });
  }, [searchParams, items, setSearchParams]);

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
    if (!confirm('Supprimer ce meuble ? Les disques qu\'il contient seront retirés de ce rangement (ils ne seront plus rangés).')) return;
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
                focus={focus}
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
            (() => {
              const cf = items.find((f) => f.id === selectedCell.furnitureId);
              return (
                <CellPanel
                  furnitureId={selectedCell.furnitureId}
                  x={selectedCell.x}
                  y={selectedCell.y}
                  furnitureName={cf?.name ?? ''}
                  title={cf ? cellLabel(cf, selectedCell.x, selectedCell.y) : `Case`}
                  onBack={() => setSelectedCell(null)}
                  onChanged={() => invalidate(true)}
                />
              );
            })()
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
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[11px] font-medium text-mocha/80">{label}</span>
      {children}
    </label>
  );
}

function FurnitureEditor({
  f,
  onPatch,
  onDelete,
}: {
  f: Furniture;
  onPatch: (id: string, partial: Partial<Furniture>, structural?: boolean) => void;
  onDelete: () => void;
}) {
  const locked = f.locked;
  const num = (key: keyof Furniture, label: string, step: number, min: number, max: number, structural = false) => (
    <Field label={label}>
      <input
        type="number"
        className="input py-1 disabled:cursor-not-allowed disabled:opacity-50"
        step={step}
        min={min}
        max={max}
        disabled={locked}
        value={f[key] as number}
        onChange={(e) => onPatch(f.id, { [key]: Number(e.target.value) } as Partial<Furniture>, structural)}
      />
    </Field>
  );

  return (
    <div className="card space-y-4 p-4">
      {/* header: name + lock + delete */}
      <div className="flex items-center gap-2">
        <span className="text-xl">{TYPE_ICON[f.type]}</span>
        <input
          className="input flex-1 py-1 font-display text-base font-bold"
          value={f.name}
          onChange={(e) => onPatch(f.id, { name: e.target.value })}
        />
        <button
          onClick={() => onPatch(f.id, { locked: !locked })}
          title={locked ? 'Déverrouiller' : 'Verrouiller (empêche de déplacer)'}
          className={`rounded-full p-2 text-sm transition-colors ${
            locked ? 'bg-accent text-cream' : 'bg-ink/5 text-mocha hover:bg-ink/10'
          }`}
        >
          {locked ? '🔒' : '🔓'}
        </button>
      </div>

      <p className="text-[11px] text-mocha/70">{TYPE_LABELS[f.type]}</p>

      {locked && (
        <div className="rounded-xl bg-accent/10 px-3 py-2 text-xs text-accent-deep">
          🔒 Meuble verrouillé — il ne peut plus être déplacé ni redimensionné. Tu peux toujours remplir ses cases.
        </div>
      )}

      <fieldset disabled={locked} className={`space-y-4 transition-opacity ${locked ? 'opacity-60' : ''}`}>
        {/* placement */}
        <div>
          <span className="mb-1 block text-[11px] font-medium text-mocha/80">Emplacement</span>
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
                disabled={locked}
                onClick={() => onPatch(f.id, { mount: m, posY: m !== 'FLOOR' && f.posY < 0.5 ? 1.4 : f.posY }, true)}
                className={`flex-1 rounded-full px-2 py-1 text-xs transition-colors disabled:opacity-50 ${
                  f.mount === m ? 'bg-accent text-cream' : 'bg-ink/5 text-mocha hover:bg-ink/10'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>

        {/* size */}
        <div>
          <span className="mb-1 block text-[11px] font-medium text-mocha/80">Taille (m)</span>
          <div className="grid grid-cols-3 gap-2">
            {num('width', 'Largeur', 0.05, 0.1, 20)}
            {num('height', 'Hauteur', 0.05, 0.1, 10)}
            {num('depth', 'Profondeur', 0.05, 0.05, 10)}
          </div>
        </div>

        {/* grid */}
        {HAS_GRID.includes(f.type) && (
          <div>
            <span className="mb-1 block text-[11px] font-medium text-mocha/80">Cases</span>
            <div className="grid grid-cols-2 gap-2">
              {num('columns', 'Colonnes', 1, 1, 20, true)}
              {num('rows', 'Rangées', 1, 1, 20, true)}
            </div>
          </div>
        )}

        {/* position */}
        <div>
          <span className="mb-1 block text-[11px] font-medium text-mocha/80">Position (m)</span>
          <div className="grid grid-cols-3 gap-2">
            {num('posX', 'X (g/d)', 0.1, -25, 25)}
            {num('posY', 'Y (haut.)', 0.1, 0, 10)}
            {num('posZ', 'Z (av/arr)', 0.1, -25, 25)}
          </div>
          <p className="mt-1 text-[11px] text-mocha/60">Y = élévation : empiler un meuble ou le monter au mur.</p>
        </div>

        {/* rotation */}
        {f.mount === 'FLOOR' && (
          <div>
            <span className="mb-1 block text-[11px] font-medium text-mocha/80">Rotation — {Math.round(f.rotation)}°</span>
            <div className="flex items-center gap-2">
              <button className="btn-outline px-2 py-1 text-sm" disabled={locked} onClick={() => onPatch(f.id, { rotation: (f.rotation - 15 + 360) % 360 })}>
                ↺
              </button>
              <input
                type="range"
                min={0}
                max={360}
                step={1}
                className="flex-1 accent-accent"
                disabled={locked}
                value={f.rotation}
                onChange={(e) => onPatch(f.id, { rotation: Number(e.target.value) })}
              />
              <button className="btn-outline px-2 py-1 text-sm" disabled={locked} onClick={() => onPatch(f.id, { rotation: (f.rotation + 15) % 360 })}>
                ↻
              </button>
            </div>
          </div>
        )}
      </fieldset>

      {/* tint (allowed even when locked) + delete */}
      <div className="flex items-center justify-between border-t border-sand/60 pt-3">
        <label className="flex items-center gap-2 text-xs text-mocha">
          Teinte
          <input
            type="color"
            value={f.color || '#6b4e34'}
            onChange={(e) => onPatch(f.id, { color: e.target.value })}
            className="h-7 w-9 cursor-pointer rounded border border-sand"
          />
          {f.color && (
            <button className="text-accent hover:underline" onClick={() => onPatch(f.id, { color: null })}>
              réinit.
            </button>
          )}
        </label>
        <button onClick={onDelete} className="text-sm text-mocha hover:text-accent" title="Supprimer le meuble">
          🗑 Supprimer
        </button>
      </div>
    </div>
  );
}

// ── Cell contents + assignment ───────────────────────────────────────────────
function CellPanel({
  furnitureId,
  x,
  y,
  furnitureName,
  title,
  onBack,
  onChanged,
}: {
  furnitureId: string;
  x: number;
  y: number;
  furnitureName: string;
  title: string;
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
  async function reorder(newOrder: string[]) {
    qc.setQueryData<CellContents>(cellKey, (prev) =>
      prev
        ? {
            ...prev,
            releases: newOrder
              .map((id, i) => ({ ...prev.releases.find((r) => r.id === id)!, position: i + 1 }))
              .filter(Boolean),
          }
        : prev,
    );
    await api.put(`/storage/furniture/${furnitureId}/cells/${x}/${y}/order`, { order: newOrder });
    refresh();
  }
  function move(index: number, dir: -1 | 1) {
    if (!data) return;
    const ids = data.releases.map((r) => r.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    reorder(ids);
  }

  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold">{title}</h2>
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
              {data.releases.map((r, i) => (
                <li key={r.id} className="flex items-center gap-2">
                  <span className="w-5 shrink-0 text-center text-xs font-semibold text-mocha/70">{r.position}</span>
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
                  <div className="flex shrink-0 flex-col leading-none">
                    <button
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      className="text-mocha hover:text-accent disabled:opacity-25"
                      title="Monter"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => move(i, 1)}
                      disabled={i === data.releases.length - 1}
                      className="text-mocha hover:text-accent disabled:opacity-25"
                      title="Descendre"
                    >
                      ▼
                    </button>
                  </div>
                  <button onClick={() => unassign(r.id)} className="shrink-0 text-mocha hover:text-accent" title="Retirer">
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
