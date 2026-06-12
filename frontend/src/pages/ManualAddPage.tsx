import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '../api/client';
import { useStorageLocations } from '../api/hooks';
import { DiscogsSearchResult } from '../api/types';

const MODES = [
  { value: 'all', label: 'Tout' },
  { value: 'artist', label: 'Artiste / groupe' },
  { value: 'barcode', label: 'Code-barres' },
  { value: 'catno', label: 'N° catalogue' },
] as const;
type Mode = (typeof MODES)[number]['value'];

/** Search-as-you-type on the Discogs database; pick a result to add it. */
function DiscogsSearch() {
  const navigate = useNavigate();
  const { data: locations } = useStorageLocations();
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<Mode>('all');
  const [debounced, setDebounced] = useState('');
  const [picked, setPicked] = useState<DiscogsSearchResult | null>(null);
  const [storageLocationId, setStorageLocationId] = useState('');
  const [storageSlot, setStorageSlot] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 450);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isFetching } = useQuery({
    queryKey: ['discogs-search', debounced, mode],
    enabled: debounced.length >= 3,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () =>
      (
        await api.get<{ results: DiscogsSearchResult[] }>('/releases/discogs-search', {
          params: { q: debounced, mode },
        })
      ).data.results,
  });

  async function add() {
    if (!picked) return;
    setBusy(true);
    setError('');
    try {
      const { data: res } = await api.post<{ id: string; existing: boolean }>(
        '/releases/from-discogs',
        {
          discogsId: picked.id,
          title: picked.title,
          year: picked.year,
          country: picked.country,
          catalogNumber: picked.catno,
          thumb: picked.thumb,
          storageLocationId: storageLocationId || undefined,
          storageSlot: storageSlot || undefined,
        },
      );
      navigate(`/release/${res.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <section className="card space-y-4 p-6">
      <div>
        <label className="label">Rechercher sur Discogs</label>
        <input
          className="input"
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPicked(null);
          }}
          placeholder={
            mode === 'barcode'
              ? '3 700368 446268…'
              : mode === 'catno'
                ? 'SMAS-2653…'
                : 'Pink Floyd Wish You Were Here…'
          }
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setMode(m.value)}
              className={`chip ${mode === m.value ? 'bg-accent text-cream' : 'hover:bg-ink/10'}`}
            >
              {m.label}
            </button>
          ))}
          {isFetching && <span className="self-center text-xs text-mocha">recherche…</span>}
        </div>
      </div>

      {debounced.length >= 3 && data && data.length === 0 && !isFetching && (
        <p className="text-sm text-mocha">Aucun résultat — essayez un autre mode de recherche.</p>
      )}

      {data && data.length > 0 && (
        <ul className="divide-y divide-ink/5 overflow-hidden rounded-xl ring-1 ring-ink/10">
          {data.map((r) => {
            const isPicked = picked?.id === r.id;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setPicked(isPicked ? null : r)}
                  disabled={!!r.existingId}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                    isPicked ? 'bg-accent/10' : r.existingId ? 'opacity-60' : 'hover:bg-ink/5'
                  }`}
                >
                  <span className="h-12 w-12 shrink-0 overflow-hidden rounded bg-ink/10">
                    {r.thumb && (
                      <img
                        src={r.thumb}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                        onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1 font-medium">{r.title}</span>
                    <span className="line-clamp-1 text-xs text-mocha">
                      {[r.year, r.country, r.formats.join(', '), r.labels.join(', '), r.catno]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  {r.existingId ? (
                    <Link
                      to={`/release/${r.existingId}`}
                      className="chip shrink-0 hover:bg-ink/10"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Déjà là — voir
                    </Link>
                  ) : (
                    <span className={`chip shrink-0 ${isPicked ? 'bg-accent text-cream' : ''}`}>
                      {isPicked ? '✓ Choisi' : 'Choisir'}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {picked && (
        <div className="space-y-3 rounded-xl bg-ink/5 p-4">
          <p className="text-sm">
            <span className="font-semibold">{picked.title}</span>
            <span className="text-mocha"> — sera enrichi automatiquement (pochettes, crédits, tracklist, paroles).</span>
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Emplacement</label>
              <select
                className="input"
                value={storageLocationId}
                onChange={(e) => setStorageLocationId(e.target.value)}
              >
                <option value="">— Aucun —</option>
                {(locations ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Position / case</label>
              <input
                className="input"
                value={storageSlot}
                onChange={(e) => setStorageSlot(e.target.value)}
                placeholder="B-12"
              />
            </div>
          </div>
          {error && <p className="text-sm text-accent">{error}</p>}
          <button type="button" onClick={add} disabled={busy} className="btn-primary">
            {busy ? 'Ajout…' : '＋ Ajouter à la collection'}
          </button>
        </div>
      )}
    </section>
  );
}

function splitList(s: string): string[] {
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseLines(s: string): { a: string; b: string; c?: string }[] {
  return s
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [a, b, c] = l.split('|').map((x) => x.trim());
      return { a: a || '', b: b || '', c };
    });
}

export default function ManualAddPage() {
  const [manual, setManual] = useState(false);
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="font-display text-3xl font-bold">Ajouter un disque</h1>
        <p className="text-sm text-mocha">
          Cherchez sur Discogs (nom, artiste, code-barres, n° de catalogue), choisissez la bonne
          édition — le reste (pochettes, crédits, tracklist, paroles) arrive tout seul.
        </p>
      </div>
      <DiscogsSearch />
      <button
        type="button"
        onClick={() => setManual((m) => !m)}
        className="text-sm font-medium text-mocha underline-offset-2 hover:underline"
      >
        {manual ? '▾ Masquer la saisie manuelle' : '▸ Pas sur Discogs ? Saisie manuelle'}
      </button>
      {manual && <ManualForm />}
    </div>
  );
}

function ManualForm() {
  const navigate = useNavigate();
  const { data: locations } = useStorageLocations();
  const coverRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [f, setF] = useState({
    title: '',
    artist: '',
    year: '',
    country: '',
    catalogNumber: '',
    labels: '',
    genres: '',
    styles: '',
    formatDescriptions: 'LP, Album',
    tags: '',
    tracklist: '',
    credits: '',
    notes: '',
    storageLocationId: '',
    storageSlot: '',
    isLive: false,
    isCompilation: false,
    isSpecialEdition: false,
  });

  const upd = (k: keyof typeof f, v: string | boolean) => setF((s) => ({ ...s, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const tracks = parseLines(f.tracklist).map((t, i) =>
        // "A1 | Title | 3:45" -> position/title/duration; if only one field, it's the title
        t.b ? { position: t.a || null, title: t.b, duration: t.c || null } : { title: t.a, position: null, duration: null },
      );
      const credits = parseLines(f.credits)
        .filter((c) => c.a && c.b)
        .map((c) => ({ artist: c.a, role: c.b }));

      const payload = {
        title: f.title,
        artist: f.artist,
        year: f.year ? Number(f.year) : undefined,
        country: f.country || undefined,
        catalogNumber: f.catalogNumber || undefined,
        labels: splitList(f.labels),
        genres: splitList(f.genres),
        styles: splitList(f.styles),
        formatDescriptions: splitList(f.formatDescriptions),
        tags: splitList(f.tags),
        tracklist: tracks,
        credits,
        notes: f.notes || undefined,
        storageLocationId: f.storageLocationId || undefined,
        storageSlot: f.storageSlot || undefined,
        flags: {
          isLive: f.isLive,
          isCompilation: f.isCompilation,
          isSpecialEdition: f.isSpecialEdition,
        },
      };

      const { data } = await api.post('/releases', payload);

      const coverFile = coverRef.current?.files?.[0];
      if (coverFile) {
        const fd = new FormData();
        fd.append('file', coverFile);
        await api.post(`/releases/${data.id}/cover`, fd);
      }

      navigate(`/release/${data.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="card grid gap-4 p-6 sm:grid-cols-2">
        <Field label="Titre *">
          <input className="input" required value={f.title} onChange={(e) => upd('title', e.target.value)} />
        </Field>
        <Field label="Artiste *">
          <input className="input" required value={f.artist} onChange={(e) => upd('artist', e.target.value)} />
        </Field>
        <Field label="Année">
          <input className="input" value={f.year} onChange={(e) => upd('year', e.target.value)} inputMode="numeric" />
        </Field>
        <Field label="Pays">
          <input className="input" value={f.country} onChange={(e) => upd('country', e.target.value)} />
        </Field>
        <Field label="N° de catalogue">
          <input className="input" value={f.catalogNumber} onChange={(e) => upd('catalogNumber', e.target.value)} />
        </Field>
        <Field label="Labels (séparés par des virgules)">
          <input className="input" value={f.labels} onChange={(e) => upd('labels', e.target.value)} />
        </Field>
        <Field label="Genres (virgules)">
          <input className="input" value={f.genres} onChange={(e) => upd('genres', e.target.value)} />
        </Field>
        <Field label="Styles (virgules)">
          <input className="input" value={f.styles} onChange={(e) => upd('styles', e.target.value)} />
        </Field>
        <Field label="Descriptions de format (virgules)">
          <input
            className="input"
            value={f.formatDescriptions}
            onChange={(e) => upd('formatDescriptions', e.target.value)}
            placeholder="LP, Album, Live"
          />
        </Field>
        <Field label="Tags (virgules)">
          <input className="input" value={f.tags} onChange={(e) => upd('tags', e.target.value)} />
        </Field>
      </div>

      <div className="card grid gap-4 p-6 sm:grid-cols-2">
        <Field label="Tracklist — une piste par ligne : « A1 | Titre | 3:45 »">
          <textarea
            className="input min-h-[120px] font-mono text-xs"
            value={f.tracklist}
            onChange={(e) => upd('tracklist', e.target.value)}
            placeholder={'A1 | So What | 9:22\nA2 | Freddie Freeloader | 9:46'}
          />
        </Field>
        <Field label="Crédits — une ligne : « Artiste | Rôle »">
          <textarea
            className="input min-h-[120px] font-mono text-xs"
            value={f.credits}
            onChange={(e) => upd('credits', e.target.value)}
            placeholder={'Paul Chambers | Bass\nBill Evans | Piano'}
          />
        </Field>
      </div>

      <div className="card grid gap-4 p-6 sm:grid-cols-2">
        <Field label="Emplacement">
          <select className="input" value={f.storageLocationId} onChange={(e) => upd('storageLocationId', e.target.value)}>
            <option value="">— Aucun —</option>
            {(locations ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Position / case">
          <input className="input" value={f.storageSlot} onChange={(e) => upd('storageSlot', e.target.value)} />
        </Field>
        <Field label="Pochette (image)">
          <input ref={coverRef} type="file" accept="image/*" className="text-sm" />
        </Field>
        <div className="flex items-end gap-3">
          {([['isLive', 'Live'], ['isCompilation', 'Compilation'], ['isSpecialEdition', 'Éd. spéciale']] as const).map(
            ([k, label]) => (
              <label key={k} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={f[k]} onChange={(e) => upd(k, e.target.checked)} />
                {label}
              </label>
            ),
          )}
        </div>
        <Field label="Notes" className="sm:col-span-2">
          <textarea className="input min-h-[80px]" value={f.notes} onChange={(e) => upd('notes', e.target.value)} />
        </Field>
      </div>

      {error && <p className="text-sm text-accent">{error}</p>}
      <button type="submit" disabled={busy} className="btn-primary">
        {busy ? 'Enregistrement…' : 'Ajouter à la collection'}
      </button>
    </form>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}
