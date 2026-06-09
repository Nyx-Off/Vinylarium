import { useRef, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { useQueryClient } from '@tanstack/react-query';
import { useStats, useIntegrations, useReenrichStatus } from '../api/hooks';
import { useAuth } from '../lib/auth';
import { Integration } from '../api/types';

export default function SettingsPage() {
  const { user, refresh } = useAuth();
  const { data: stats } = useStats();
  const { data: integrations, isLoading: integrationsLoading } = useIntegrations();
  const { data: reenrich } = useReenrichStatus();
  const qc = useQueryClient();

  async function toggleReenrich() {
    try {
      if (reenrich?.inProgress) {
        await api.post('/releases/reenrich-all/stop');
      } else {
        await api.post('/releases/reenrich-all');
      }
      qc.invalidateQueries({ queryKey: ['reenrich-status'] });
    } catch (e) {
      setMsg(errorMessage(e));
    }
  }
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

      <section className="card space-y-3 p-6">
        <h2 className="font-display text-xl font-bold text-ink">Enrichissement</h2>
        <p className="text-sm text-mocha">
          Relance l'enrichissement Discogs (pochettes, crédits, verso, paroles) sur toute la
          collection. Utile après l'ajout d'un jeton ou pour récupérer les nouveautés.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={toggleReenrich}
            className={reenrich?.inProgress ? 'btn-outline' : 'btn-primary'}
          >
            {reenrich?.inProgress ? '■ Arrêter' : '↻ Tout ré-enrichir'}
          </button>
          {reenrich && (
            <span className="text-sm text-mocha">
              {reenrich.inProgress
                ? `En cours · ${reenrich.waiting} en attente, ${reenrich.active} en traitement`
                : reenrich.pending > 0
                  ? `${reenrich.pending} disque(s) en attente`
                  : 'À jour'}
            </span>
          )}
        </div>
      </section>

      <section className="card p-6">
        <h2 className="mb-4 font-display text-xl font-bold text-ink">État des API</h2>
        {integrationsLoading ? (
          <p className="text-sm text-mocha">Vérification…</p>
        ) : (
          <div className="space-y-2">
            {(integrations ?? []).map((it) => (
              <IntegrationRow key={it.name} it={it} />
            ))}
          </div>
        )}
        <p className="mt-4 text-sm text-mocha">
          Les clés Discogs / MusicBrainz / Genius se configurent dans le fichier{' '}
          <code className="rounded bg-ink/10 px-1">.env</code> du serveur (variables{' '}
          <code className="rounded bg-ink/10 px-1">DISCOGS_TOKEN</code>,{' '}
          <code className="rounded bg-ink/10 px-1">GENIUS_ACCESS_TOKEN</code>…), puis{' '}
          <code className="rounded bg-ink/10 px-1">docker compose up -d</code>.
        </p>
      </section>
    </div>
  );
}

function IntegrationRow({ it }: { it: Integration }) {
  const color = it.ok ? 'bg-emerald-500' : it.configured ? 'bg-red-500' : 'bg-ink/30';
  const state = it.ok ? 'Fonctionnel' : it.configured ? 'En erreur' : 'Non configuré';
  return (
    <div className="flex items-center justify-between rounded-xl bg-ink/5 px-4 py-3">
      <div className="flex items-center gap-3">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${color}`} />
        <div>
          <p className="font-semibold">{it.name}</p>
          <p className="text-xs text-mocha">{it.detail}</p>
        </div>
      </div>
      <span className="text-xs font-medium text-mocha">{state}</span>
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
