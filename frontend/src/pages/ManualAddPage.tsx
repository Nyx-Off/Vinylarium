import { FormEvent, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { useStorageLocations } from '../api/hooks';

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
    <form onSubmit={submit} className="mx-auto max-w-3xl space-y-5">
      <h1 className="font-display text-3xl font-bold">Ajouter un disque</h1>
      <p className="text-sm text-mocha">Pour les disques absents de Discogs ou les pièces particulières.</p>

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
