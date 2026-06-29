import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { useQueryClient } from '@tanstack/react-query';
import {
  useStats,
  useIntegrations,
  useReenrichStatus,
  useSystemVersion,
  useImportJob,
  useSpotifyStatus,
} from '../api/hooks';
import { useAuth } from '../lib/auth';
import {
  FEATURES,
  FeatureFlags,
  FeatureKey,
  LIBRARY_VIEW_KEYS,
  resolveFeatures,
} from '../lib/features';
import { Integration, ImportJob, UpdateStatus } from '../api/types';
import { NowPlayingCard } from '../components/NowPlaying';

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

  const [missingMsg, setMissingMsg] = useState('');
  async function reenrichMissing(what: 'discogs' | 'genius') {
    setMissingMsg('');
    try {
      const { data } = await api.post<{ queued: number }>('/releases/reenrich-missing', { what });
      setMissingMsg(
        data.queued > 0
          ? `${data.queued} disque(s) mis en file (${what === 'discogs' ? 'Discogs' : 'Genius'}). En cas de quota épuisé, la file se met en pause et reprend toute seule.`
          : 'Rien à compléter — tout est déjà passé.',
      );
      qc.invalidateQueries({ queryKey: ['reenrich-status'] });
    } catch (e) {
      setMissingMsg(errorMessage(e));
    }
  }
  const [yearsMsg, setYearsMsg] = useState('');
  async function recomputeYears() {
    setYearsMsg('');
    try {
      const { data } = await api.post<{ queued: number }>('/releases/recompute-years');
      setYearsMsg(
        data.queued > 0
          ? `${data.queued} disque(s) en file — récupération du master (année d'origine), sans re-télécharger les images.`
          : 'Rien à corriger — les années sont déjà à jour.',
      );
      qc.invalidateQueries({ queryKey: ['reenrich-status'] });
    } catch (e) {
      setYearsMsg(errorMessage(e));
    }
  }
  async function stopLyrics() {
    try {
      await api.post('/releases/reenrich-all/stop', { queue: 'lyrics' });
      qc.invalidateQueries({ queryKey: ['reenrich-status'] });
    } catch (e) {
      setMissingMsg(errorMessage(e));
    }
  }

  const avatarRef = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [password, setPassword] = useState('');
  const [discogsUsername, setDiscogsUsername] = useState(user?.discogsUsername ?? '');
  const [discogsToken, setDiscogsToken] = useState(user?.discogsToken ?? '');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  // Per-profile display toggles (Affichage) — saved instantly on each change.
  const [features, setFeatures] = useState<FeatureFlags>(() => resolveFeatures(user?.preferences));
  const [featuresBusy, setFeaturesBusy] = useState(false);
  const [featuresMsg, setFeaturesMsg] = useState('');
  const enabledViewCount = LIBRARY_VIEW_KEYS.filter((k) => features[k]).length;

  async function toggleFeature(key: FeatureKey, enabled: boolean) {
    if (!user) return;
    const prev = features;
    const next = { ...features, [key]: enabled };
    setFeatures(next);
    setFeaturesBusy(true);
    setFeaturesMsg('');
    try {
      await api.patch(`/users/${user.id}`, {
        preferences: { ...(user.preferences ?? {}), features: next },
      });
      await refresh();
      setFeaturesMsg('Affichage mis à jour.');
    } catch (e) {
      setFeatures(prev); // revert the toggle if the save failed
      setFeaturesMsg(errorMessage(e));
    } finally {
      setFeaturesBusy(false);
    }
  }

  // Server API keys (enrichment) — admin only, layered over .env.
  const [apiKeys, setApiKeys] = useState({
    discogsToken: '',
    geniusAccessToken: '',
    spotifyClientId: '',
    spotifyClientSecret: '',
  });
  const [apiEnv, setApiEnv] = useState({ discogs: false, genius: false, spotify: false });
  const [apiKeysLoaded, setApiKeysLoaded] = useState(false);
  const [apiMsg, setApiMsg] = useState('');
  const [apiBusy, setApiBusy] = useState(false);

  useEffect(() => {
    if (!user?.isAdmin) return;
    api
      .get<{
        discogsToken: string;
        geniusAccessToken: string;
        spotifyClientId: string;
        spotifyClientSecret: string;
        envConfigured: { discogs: boolean; genius: boolean; spotify: boolean };
      }>('/system/api-keys')
      .then(({ data }) => {
        setApiKeys({
          discogsToken: data.discogsToken,
          geniusAccessToken: data.geniusAccessToken,
          spotifyClientId: data.spotifyClientId,
          spotifyClientSecret: data.spotifyClientSecret,
        });
        setApiEnv(data.envConfigured);
        setApiKeysLoaded(true);
      })
      .catch(() => {});
  }, [user?.isAdmin]);

  async function saveApiKeys() {
    setApiBusy(true);
    setApiMsg('');
    try {
      await api.put('/system/api-keys', apiKeys);
      setApiMsg('Clés enregistrées — appliquées immédiatement (le worker les recharge sous une minute).');
      qc.invalidateQueries({ queryKey: ['integrations'] });
    } catch (e) {
      setApiMsg(errorMessage(e));
    } finally {
      setApiBusy(false);
    }
  }

  // Spotify (per-user OAuth connection).
  const { data: spotify } = useSpotifyStatus();
  const [spotifyMsg, setSpotifyMsg] = useState('');
  async function connectSpotify() {
    setSpotifyMsg('');
    try {
      // We pass OUR callback as returnUrl; Spotify redirects to the fixed relay
      // page, which bounces the browser back here with the code (no tunnel/HTTPS).
      const returnUrl = `${window.location.origin}/spotify/callback`;
      const { data } = await api.get<{ url: string; state: string }>('/spotify/auth-url', {
        params: { returnUrl },
      });
      localStorage.setItem('spotify_state', data.state);
      window.location.href = data.url;
    } catch (e) {
      setSpotifyMsg(errorMessage(e));
    }
  }
  async function disconnectSpotify() {
    await api.post('/spotify/disconnect');
    qc.invalidateQueries({ queryKey: ['spotify-status'] });
    qc.invalidateQueries({ queryKey: ['spotify-now'] });
  }

  // Discogs collection sync (API, no CSV): launch then poll the ImportJob.
  const [syncJobId, setSyncJobId] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState('');
  const { data: syncJob } = useImportJob(
    syncJobId ?? undefined,
    !!syncJobId,
  );
  const syncRunning = !!syncJobId && syncJob?.status !== 'COMPLETED' && syncJob?.status !== 'FAILED';

  // New discs land in the library as the sync goes — refresh it at the end.
  useEffect(() => {
    if (syncJob?.status === 'COMPLETED') {
      qc.invalidateQueries({ queryKey: ['releases'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncJob?.status]);

  async function syncDiscogs() {
    setSyncMsg('');
    try {
      const { data } = await api.post<ImportJob>('/import/discogs-sync');
      setSyncJobId(data.id);
    } catch (e) {
      setSyncMsg(errorMessage(e));
    }
  }

  const backupRef = useRef<HTMLInputElement>(null);
  const [backupMsg, setBackupMsg] = useState('');
  const [backupBusy, setBackupBusy] = useState(false);

  async function exportBackup() {
    setBackupBusy(true);
    setBackupMsg('');
    try {
      const { data } = await api.get('/backup/export', { responseType: 'blob' });
      const url = URL.createObjectURL(data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vinylarium-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setBackupMsg('Sauvegarde téléchargée.');
    } catch (e) {
      setBackupMsg(errorMessage(e));
    } finally {
      setBackupBusy(false);
    }
  }

  const { data: version } = useSystemVersion();
  const [updBusy, setUpdBusy] = useState<'idle' | 'checking' | 'updating'>('idle');
  const [updMsg, setUpdMsg] = useState('');
  const [updStatus, setUpdStatus] = useState<UpdateStatus | null>(null);

  // Clear only Vinylarium's client-side caches, then hard-reload to pull the
  // freshest build (no service worker today, but stay future-proof).
  const [cacheBusy, setCacheBusy] = useState(false);
  async function clearSiteCache() {
    setCacheBusy(true);
    try {
      qc.clear(); // in-memory TanStack Query cache
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    } catch {
      /* best-effort — reload regardless */
    }
    window.location.reload();
  }

  async function checkUpdates() {
    setUpdBusy('checking');
    setUpdMsg('');
    try {
      await api.post('/system/check');
      qc.invalidateQueries({ queryKey: ['system-version'] });
    } catch (e) {
      setUpdMsg(errorMessage(e));
    } finally {
      setUpdBusy('idle');
    }
  }

  // The backend restarts mid-update: polling errors are EXPECTED, keep going.
  async function pollUpdate(startedAt: number) {
    try {
      const { data } = await api.get<UpdateStatus>('/system/update-status');
      setUpdStatus(data);
      if (data.state === 'done') {
        setUpdBusy('idle');
        setUpdMsg('Mise à jour terminée ✓ — rechargez la page pour voir la nouvelle version.');
        qc.invalidateQueries({ queryKey: ['system-version'] });
        return;
      }
      if (data.state === 'error') {
        setUpdBusy('idle');
        setUpdMsg(`Échec : ${data.detail ?? 'erreur inconnue'}`);
        return;
      }
    } catch {
      /* API en cours de redémarrage */
    }
    if (Date.now() - startedAt > 12 * 60_000) {
      setUpdBusy('idle');
      setUpdMsg('Délai dépassé — consultez les journaux du service « updater ».');
      return;
    }
    setTimeout(() => pollUpdate(startedAt), 4000);
  }

  async function launchUpdate() {
    if (!window.confirm('Mettre à jour Vinylarium maintenant ? L’application redémarrera (moins d’une minute d’interruption).'))
      return;
    setUpdBusy('updating');
    setUpdMsg('');
    setUpdStatus(null);
    try {
      await api.post('/system/update');
      pollUpdate(Date.now());
    } catch (e) {
      setUpdMsg(errorMessage(e));
      setUpdBusy('idle');
    }
  }

  async function importBackup() {
    const file = backupRef.current?.files?.[0];
    if (!file) {
      setBackupMsg('Choisissez d’abord un fichier de sauvegarde (.json).');
      return;
    }
    setBackupBusy(true);
    setBackupMsg('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post<{
        total: number;
        created: number;
        updated: number;
        enrichQueued: number;
        furniture: number;
      }>('/backup/import', fd);
      setBackupMsg(
        `Sauvegarde restaurée : ${data.created} disque(s) recréé(s), ${data.updated} mis à jour` +
          (data.furniture ? `, ${data.furniture} meuble(s) restauré(s)` : '') +
          (data.enrichQueued ? `, ${data.enrichQueued} enrichissement(s) Discogs lancé(s).` : '.'),
      );
      if (backupRef.current) backupRef.current.value = '';
      qc.invalidateQueries();
    } catch (e) {
      setBackupMsg(errorMessage(e));
    } finally {
      setBackupBusy(false);
    }
  }

  async function saveProfile() {
    if (!user) return;
    setBusy(true);
    setMsg('');
    try {
      await api.patch(`/users/${user.id}`, {
        displayName: displayName || undefined,
        ...(password ? { password } : {}),
        discogsUsername: discogsUsername.trim() || null,
        discogsToken: discogsToken.trim() || null,
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
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Identifiant Discogs</label>
            <input
              className="input"
              value={discogsUsername}
              onChange={(e) => setDiscogsUsername(e.target.value)}
              placeholder="mon-pseudo-discogs"
            />
          </div>
          <div>
            <label className="label">Jeton API Discogs (collection privée)</label>
            <input
              className="input"
              value={discogsToken}
              onChange={(e) => setDiscogsToken(e.target.value)}
              placeholder="discogs.com/settings/developers"
            />
          </div>
        </div>
        {msg && <p className="text-sm text-accent">{msg}</p>}
        <button onClick={saveProfile} disabled={busy} className="btn-primary">
          {busy ? '…' : 'Enregistrer'}
        </button>
      </section>

      <section className="card space-y-4 p-6">
        <div>
          <h2 className="font-display text-xl font-bold">Affichage</h2>
          <p className="text-sm text-mocha">
            Activez ou masquez des fonctionnalités. Les changements s'appliquent
            aussitôt, pour ce profil.
          </p>
        </div>
        {(['nav', 'library'] as const).map((group) => (
          <div key={group} className="space-y-2">
            <h3 className="label">
              {group === 'nav' ? 'Menus de navigation' : 'Vues de la bibliothèque'}
            </h3>
            {FEATURES.filter((f) => f.group === group).map((f) => {
              const lastView =
                LIBRARY_VIEW_KEYS.includes(f.key) && features[f.key] && enabledViewCount <= 1;
              return (
                <label
                  key={f.key}
                  className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-ink/10 p-3 hover:bg-ink/5"
                >
                  <span>
                    <span className="font-medium text-ink">{f.label}</span>
                    <span className="block text-xs text-mocha">
                      {f.description}
                      {lastView && ' · au moins une vue doit rester active'}
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={features[f.key]}
                    disabled={featuresBusy || lastView}
                    onChange={(e) => toggleFeature(f.key, e.target.checked)}
                  />
                  <span className="relative mt-0.5 h-6 w-11 shrink-0 rounded-full bg-ink/20 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-cream after:shadow after:transition-transform peer-checked:bg-accent peer-checked:after:translate-x-5 peer-disabled:opacity-40" />
                </label>
              );
            })}
          </div>
        ))}
        {featuresMsg && <p className="text-sm text-accent">{featuresMsg}</p>}
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
        <div className="rounded-xl bg-ink/5 px-4 py-3">
          <p className="font-semibold">Compléter seulement les manquants</p>
          <p className="mb-3 text-xs text-mocha">
            Ne traite que les disques jamais enrichis (la date du dernier passage est mémorisée).
            Si le quota d'une API est épuisé, la file se met en pause et reprend automatiquement là
            où elle en était.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => reenrichMissing('discogs')}
              disabled={!reenrich || reenrich.missingDiscogs === 0}
              className="btn-outline"
            >
              💿 Discogs{reenrich ? ` (${reenrich.missingDiscogs})` : ''}
            </button>
            <button
              onClick={() => reenrichMissing('genius')}
              disabled={!reenrich || reenrich.missingGenius === 0}
              className="btn-outline"
            >
              📝 Paroles Genius{reenrich ? ` (${reenrich.missingGenius})` : ''}
            </button>
            {reenrich?.lyrics.inProgress && (
              <span className="text-sm text-mocha">
                Paroles : {reenrich.lyrics.waiting} en attente, {reenrich.lyrics.active} en cours{' '}
                <button onClick={stopLyrics} className="text-accent underline-offset-2 hover:underline">
                  arrêter
                </button>
              </span>
            )}
          </div>
          {missingMsg && <p className="mt-2 text-sm text-accent">{missingMsg}</p>}
        </div>
        <div className="rounded-xl bg-ink/5 px-4 py-3">
          <p className="font-semibold">Corriger les années (origine / pressage)</p>
          <p className="mb-3 text-xs text-mocha">
            Pour les disques enrichis avant l'ajout de la distinction année d'origine /
            année de pressage : récupère uniquement le master (année de sortie originale)
            sans re-télécharger les pochettes ni tout ré-enrichir. Sans effet si tout est
            déjà à jour.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={recomputeYears}
              disabled={!reenrich || reenrich.staleYears === 0}
              className="btn-outline"
            >
              🗓️ Recalculer les années{reenrich ? ` (${reenrich.staleYears})` : ''}
            </button>
          </div>
          {yearsMsg && <p className="mt-2 text-sm text-accent">{yearsMsg}</p>}
        </div>
      </section>

      <section className="card space-y-3 p-6">
        <h2 className="font-display text-xl font-bold text-ink">Ajout & sauvegarde</h2>
        <div className="rounded-xl bg-ink/5 px-4 py-3">
          <p className="font-semibold">Récupérer ma collection Discogs</p>
          <p className="mb-3 text-xs text-mocha">
            Va chercher vos disques directement via l'API Discogs (identifiant — et jeton pour une
            collection privée — à renseigner dans le profil ci-dessus). Les disques déjà présents
            sont ignorés, les nouveaux sont enrichis automatiquement.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={syncDiscogs} disabled={syncRunning} className="btn-primary">
              {syncRunning ? '⏳ Récupération…' : '🔄 Récupérer ma collection'}
            </button>
            {syncJob && (
              <span className="text-sm text-mocha">
                {syncJob.status === 'COMPLETED'
                  ? `Terminé : ${syncJob.importedCount} ajouté(s), ${syncJob.skippedCount} déjà présent(s).`
                  : syncJob.status === 'FAILED'
                    ? `Échec : ${syncJob.error ?? 'erreur inconnue'}`
                    : `${syncJob.processedRows}${syncJob.totalRows ? ` / ${syncJob.totalRows}` : ''} disque(s) parcourus…`}
              </span>
            )}
          </div>
          {syncMsg && <p className="mt-2 text-sm text-accent">{syncMsg}</p>}
        </div>
        <div className="rounded-xl bg-ink/5 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold">Ajouter un disque</p>
              <p className="text-xs text-mocha">
                Recherche en direct sur Discogs (nom, artiste, code-barres, n° de catalogue).
              </p>
            </div>
            <Link to="/add" className="btn-outline">
              ＋ Ajouter
            </Link>
          </div>
        </div>
        <div className="rounded-xl bg-ink/5 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold">Import Discogs (CSV)</p>
              <p className="text-xs text-mocha">
                Déposez l'export CSV de votre collection Discogs — création + enrichissement.
              </p>
            </div>
            <Link to="/import" className="btn-outline">
              📥 Ouvrir l'import
            </Link>
          </div>
        </div>
        <div className="rounded-xl bg-ink/5 px-4 py-3">
          <p className="font-semibold">Sauvegarde de la collection</p>
          <p className="mb-3 text-xs text-mocha">
            Exporte un fichier JSON avec vos disques et tout ce qui vous appartient (notes, tags,
            paroles et anecdotes manuelles) ainsi que tout le <strong>rangement 3D</strong> : la
            pièce, vos meubles (position, taille, verrou…) et quel disque est dans quelle case. La
            restauration recrée les disques manquants (l'enrichissement Discogs se relance tout
            seul) et remet vos données — sans doublon. À ne pas confondre avec l'import Discogs.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={exportBackup} disabled={backupBusy} className="btn-outline">
              ⬇ Exporter la sauvegarde
            </button>
            <input
              ref={backupRef}
              type="file"
              accept="application/json,.json"
              className="max-w-[230px] text-sm"
            />
            <button onClick={importBackup} disabled={backupBusy} className="btn-primary">
              {backupBusy ? '…' : '⬆ Restaurer'}
            </button>
          </div>
          {backupMsg && <p className="mt-2 text-sm text-accent">{backupMsg}</p>}
        </div>
      </section>

      <section className="card space-y-3 p-6">
        <h2 className="font-display text-xl font-bold text-ink">Mise à jour de l'application</h2>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="chip">
            Version installée : {version?.currentVersion ?? version?.check?.currentVersion ?? 'inconnue'}
          </span>
          {version?.currentSha && (
            <span className="chip" title="Commit déployé">
              {version.currentSha.slice(0, 7)}
            </span>
          )}
          {version?.check && (
            <span className="text-mocha">
              Dernière vérification :{' '}
              {new Date(version.check.checkedAt).toLocaleString('fr-FR', {
                dateStyle: 'short',
                timeStyle: 'short',
              })}{' '}
              — vérification automatique chaque jour.
            </span>
          )}
        </div>

        {version?.check?.error && (
          <p className="text-sm text-red-700">Vérification impossible : {version.check.error}</p>
        )}

        {version?.check?.updateAvailable ? (
          <div className="rounded-xl bg-accent/10 px-4 py-3">
            <p className="font-semibold text-accent">
              {version.check.latestVersion
                ? `Mise à jour disponible — version ${version.check.latestVersion}`
                : 'Mise à jour disponible'}
              {version.check.behindBy ? ` (${version.check.behindBy} commit(s) de retard)` : ''}
            </p>
            <ul className="mt-2 space-y-1 text-sm text-ink">
              {version.check.commits.slice(0, 8).map((c) => (
                <li key={c.sha} className="flex gap-2">
                  <code className="shrink-0 rounded bg-ink/10 px-1 text-xs leading-5">
                    {c.sha.slice(0, 7)}
                  </code>
                  <span className="line-clamp-1">{c.message}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          version?.check &&
          !version.check.error && (
            <p className="text-sm text-mocha">
              ✓ Vinylarium est à jour
              {version.check.latestVersion ? ` (version ${version.check.latestVersion})` : ''}.
            </p>
          )
        )}

        {updBusy === 'updating' && (
          <div className="rounded-xl bg-ink/5 px-4 py-3">
            <p className="text-sm font-semibold">
              ⏳ {updStatus?.detail ?? 'Mise à jour en cours…'}
            </p>
            <p className="text-xs text-mocha">
              Récupération du code, reconstruction des images puis redémarrage — la page peut
              brièvement perdre la connexion, ne la fermez pas.
            </p>
          </div>
        )}
        {updMsg && <p className="text-sm text-accent">{updMsg}</p>}

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={checkUpdates}
            disabled={updBusy !== 'idle'}
            className="btn-outline"
          >
            {updBusy === 'checking' ? '…' : '⟳ Vérifier maintenant'}
          </button>
          {user?.isAdmin && (
            <button
              onClick={launchUpdate}
              disabled={updBusy !== 'idle' || !version?.check?.updateAvailable}
              className="btn-primary"
              title={
                version?.check?.updateAvailable
                  ? 'Récupère la dernière version depuis GitHub et redémarre'
                  : 'Aucune mise à jour disponible'
              }
            >
              ⬆ Mettre à jour
            </button>
          )}
        </div>
      </section>

      <section className="card space-y-3 p-6">
        <h2 className="font-display text-xl font-bold text-ink">Cache du site</h2>
        <p className="text-sm text-mocha">
          Vide les données mises en cache par le navigateur pour Vinylarium
          (et seulement Vinylarium), puis recharge la page — pratique si
          l'affichage semble figé sur une ancienne version. Tu restes connecté.
        </p>
        <button onClick={clearSiteCache} disabled={cacheBusy} className="btn-outline">
          {cacheBusy ? '…' : '🧹 Vider le cache du site'}
        </button>
      </section>

      <section className="card p-6">
        <h2 className="mb-1 font-display text-xl font-bold text-ink">Spotify</h2>
        <p className="mb-4 text-sm text-mocha">
          Connectez votre compte pour afficher « en cours d'écoute » et lancer un vinyle depuis sa
          fiche (lecture sur un appareil Spotify actif — nécessite Spotify Premium).
        </p>
        {!spotify?.configured ? (
          <p className="rounded-xl bg-ink/5 px-4 py-3 text-sm text-mocha">
            Spotify n'est pas encore configuré sur le serveur (Client ID/Secret à renseigner par un
            administrateur dans « État des API »).
          </p>
        ) : spotify.connected ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="chip bg-emerald-500/15 text-emerald-700">
                ✓ Connecté{spotify.name ? ` — ${spotify.name}` : ''}
              </span>
              <button onClick={disconnectSpotify} className="btn-outline">
                Déconnecter
              </button>
            </div>
            <NowPlayingCard />
          </div>
        ) : (
          <button onClick={connectSpotify} className="btn-primary">
            Connecter mon compte Spotify
          </button>
        )}
        {spotifyMsg && <p className="mt-2 text-sm text-accent">{spotifyMsg}</p>}
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
        {user?.isAdmin && apiKeysLoaded && (
          <div className="mt-4 rounded-xl bg-ink/5 px-4 py-3">
            <p className="font-semibold">Clés API du serveur (enrichissement)</p>
            <p className="mb-3 text-xs text-mocha">
              Utilisées par l'enrichissement pour toute la collection. Un champ vide garde la
              valeur du fichier <code className="rounded bg-ink/10 px-1">.env</code> s'il y en a
              une. MusicBrainz ne demande aucune clé.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Jeton Discogs</label>
                <input
                  className="input"
                  value={apiKeys.discogsToken}
                  onChange={(e) => setApiKeys((k) => ({ ...k, discogsToken: e.target.value }))}
                  placeholder={apiEnv.discogs ? 'défini dans .env — vide = le garder' : 'discogs.com/settings/developers'}
                />
              </div>
              <div>
                <label className="label">Jeton Genius (Client Access Token)</label>
                <input
                  className="input"
                  value={apiKeys.geniusAccessToken}
                  onChange={(e) => setApiKeys((k) => ({ ...k, geniusAccessToken: e.target.value }))}
                  placeholder={apiEnv.genius ? 'défini dans .env — vide = le garder' : 'genius.com/api-clients'}
                />
              </div>
              <div>
                <label className="label">Spotify — Client ID</label>
                <input
                  className="input"
                  value={apiKeys.spotifyClientId}
                  onChange={(e) => setApiKeys((k) => ({ ...k, spotifyClientId: e.target.value }))}
                  placeholder={apiEnv.spotify ? 'défini dans .env — vide = le garder' : 'developer.spotify.com'}
                />
              </div>
              <div>
                <label className="label">Spotify — Client Secret</label>
                <input
                  className="input"
                  type="password"
                  value={apiKeys.spotifyClientSecret}
                  onChange={(e) => setApiKeys((k) => ({ ...k, spotifyClientSecret: e.target.value }))}
                  placeholder={apiEnv.spotify ? 'défini dans .env — vide = le garder' : 'Client Secret de l’app Spotify'}
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-mocha">
              Spotify : créez une app sur developer.spotify.com et ajoutez <strong>exactement</strong>{' '}
              cette URL de redirection (page-relais qui ramène automatiquement vers cette instance, même
              en accès local) :{' '}
              <code className="rounded bg-ink/10 px-1 break-all">{spotify?.redirectUri ?? '…'}</code>
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button onClick={saveApiKeys} disabled={apiBusy} className="btn-primary">
                {apiBusy ? '…' : 'Enregistrer les clés'}
              </button>
              {apiMsg && <span className="text-sm text-accent">{apiMsg}</span>}
            </div>
          </div>
        )}
        {!user?.isAdmin && (
          <p className="mt-4 text-sm text-mocha">
            Les clés API du serveur se configurent ici par un administrateur (ou dans le fichier{' '}
            <code className="rounded bg-ink/10 px-1">.env</code>).
          </p>
        )}
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
