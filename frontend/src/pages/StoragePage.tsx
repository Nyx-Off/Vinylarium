import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../api/client';
import { useStorageLocations } from '../api/hooks';

const EMPTY = { label: '', furniture: '', shelf: '', column: '', row: '', bin: '', note: '' };

export default function StoragePage() {
  const qc = useQueryClient();
  const { data: locations, isLoading } = useStorageLocations();
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['storage'] });
    qc.invalidateQueries({ queryKey: ['facets'] });
  };

  async function create() {
    setBusy(true);
    setError('');
    try {
      await api.post('/storage', {
        label: form.label || undefined,
        furniture: form.furniture || undefined,
        shelf: form.shelf || undefined,
        column: form.column || undefined,
        row: form.row || undefined,
        bin: form.bin || undefined,
        note: form.note || undefined,
      });
      setForm(EMPTY);
      refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Supprimer cet emplacement ? Les disques associés ne seront plus rangés ici.')) return;
    await api.delete(`/storage/${id}`);
    refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div>
        <h1 className="mb-1 font-display text-3xl font-bold">Rangement</h1>
        <p className="mb-5 text-sm text-mocha">
          Décrivez vos meubles, étagères et bacs pour retrouver chaque disque en un clin d'œil.
        </p>

        {isLoading ? (
          <p className="text-mocha">Chargement…</p>
        ) : locations && locations.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {locations.map((l) => (
              <div key={l.id} className="card flex items-start justify-between gap-2 p-4">
                <div>
                  <p className="font-semibold">{l.label}</p>
                  {l.note && <p className="text-xs text-mocha">{l.note}</p>}
                  <Link
                    to={`/search?storageLocationId=${l.id}`}
                    className="mt-1 inline-block text-xs text-accent hover:underline"
                  >
                    {l.releaseCount} disque{l.releaseCount > 1 ? 's' : ''} →
                  </Link>
                </div>
                <button onClick={() => remove(l.id)} className="text-mocha hover:text-accent" title="Supprimer">
                  ✕
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-mocha">Aucun emplacement pour l'instant.</p>
        )}
      </div>

      <aside className="card h-fit space-y-3 p-5 lg:sticky lg:top-20">
        <h2 className="font-display text-xl font-bold">Nouvel emplacement</h2>
        <div>
          <label className="label">Libellé (ou laissez vide pour composer)</label>
          <input
            className="input"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            placeholder="Meuble salon / Étagère 2 / Bac B"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(['furniture', 'shelf', 'column', 'row', 'bin'] as const).map((k) => (
            <div key={k}>
              <label className="label">
                {{ furniture: 'Meuble', shelf: 'Étagère', column: 'Colonne', row: 'Rangée', bin: 'Bac / case' }[k]}
              </label>
              <input
                className="input"
                value={form[k]}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              />
            </div>
          ))}
        </div>
        <div>
          <label className="label">Note</label>
          <input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>
        {error && <p className="text-sm text-accent">{error}</p>}
        <button onClick={create} disabled={busy} className="btn-primary w-full">
          {busy ? '…' : 'Ajouter'}
        </button>
      </aside>
    </div>
  );
}
