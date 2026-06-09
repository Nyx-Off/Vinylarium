import { useRef, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { useStats } from '../api/hooks';
import { useAuth } from '../lib/auth';

export default function SettingsPage() {
  const { user, refresh } = useAuth();
  const { data: stats } = useStats();
  const avatarRef = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function saveProfile() {
    if (!user) return;
    setBusy(true);
    setMsg('');
    try {
      await api.patch(`/users/${user.id}`, {
        displayName: displayName || undefined,
        ...(password ? { password } : {}),
      });
      const file = avatarRef.current?.files?.[0];
      if (file) {
        const fd = new FormData();
        fd.append('file', file);
        await api.post(`/users/${user.id}/avatar`, fd);
      }
      await refresh();
      setPassword('');
      setMsg('Profil mis à jour.');
    } catch (e) {
      setMsg(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-display text-3xl font-bold">Paramètres</h1>

      <section className="card space-y-3 p-6">
        <h2 className="font-display text-xl font-bold">Profil</h2>
        <div>
          <label className="label">Nom affiché</label>
          <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div>
          <label className="label">Nouveau mot de passe (vide = inchangé)</label>
          <input
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>
        <div>
          <label className="label">Photo de profil</label>
          <input ref={avatarRef} type="file" accept="image/*" className="text-sm" />
        </div>
        {msg && <p className="text-sm text-accent">{msg}</p>}
        <button onClick={saveProfile} disabled={busy} className="btn-primary">
          {busy ? '…' : 'Enregistrer'}
        </button>
      </section>

      {stats && (
        <section className="card p-6">
          <h2 className="mb-4 font-display text-xl font-bold">Statistiques de la collection</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Disques" value={stats.totals.releases} />
            <Stat label="Artistes" value={stats.totals.artists} />
            <Stat label="Labels" value={stats.totals.labels} />
            <Stat label="Live" value={stats.totals.live} />
          </div>
          {stats.totals.pendingEnrichment > 0 && (
            <p className="mt-4 text-sm text-mocha">
              ⏳ {stats.totals.pendingEnrichment} disque(s) en cours d'enrichissement.
            </p>
          )}
          {stats.topGenres.length > 0 && (
            <div className="mt-4">
              <h3 className="label">Genres dominants</h3>
              <div className="flex flex-wrap gap-1.5">
                {stats.topGenres.map((g) => (
                  <span key={g.name} className="chip">
                    {g.name} · {g.count}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      <section className="card p-6 text-sm text-mocha">
        <h2 className="mb-2 font-display text-xl font-bold text-ink">Clés API</h2>
        <p>
          Les clés Discogs / MusicBrainz / Genius se configurent dans le fichier <code className="rounded bg-ink/10 px-1">.env</code> du
          serveur (variables <code className="rounded bg-ink/10 px-1">DISCOGS_TOKEN</code>, etc.), puis
          <code className="rounded bg-ink/10 px-1"> docker compose up -d</code>. Sans jeton Discogs, l'enrichissement reste
          possible mais limité (25 req/min, sans certaines images).
        </p>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-ink/5 p-4 text-center">
      <p className="font-display text-3xl font-bold text-accent">{value}</p>
      <p className="text-xs uppercase tracking-wide text-mocha">{label}</p>
    </div>
  );
}
