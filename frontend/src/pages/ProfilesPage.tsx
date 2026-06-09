import { FormEvent, useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { useProfiles, useSetup } from '../api/hooks';
import { PublicUser } from '../api/types';
import { useAuth } from '../lib/auth';
import { Disc } from '../components/Layout';
import { Spinner } from '../components/Spinner';

type Mode = 'select' | 'create' | 'password';

function BigAvatar({ user }: { user: PublicUser }) {
  if (user.avatarUrl) {
    return <img src={user.avatarUrl} alt="" className="h-24 w-24 rounded-2xl object-cover shadow-sleeve" />;
  }
  return (
    <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent-deep text-4xl font-bold text-cream shadow-sleeve">
      {user.displayName?.[0]?.toUpperCase() ?? '?'}
    </div>
  );
}

export default function ProfilesPage() {
  const { login } = useAuth();
  const { data: setup } = useSetup();
  const { data: profiles, isLoading } = useProfiles();
  const [mode, setMode] = useState<Mode>('select');
  const [selected, setSelected] = useState<PublicUser | null>(null);
  const [password, setPassword] = useState('');
  const [form, setForm] = useState({ username: '', displayName: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (setup?.needsSetup) setMode('create');
  }, [setup]);

  async function doLogin(username: string, pwd?: string) {
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post('/auth/login', { username, password: pwd });
      login(data.token, data.user);
    } catch (e) {
      setError(errorMessage(e, 'Connexion impossible'));
    } finally {
      setBusy(false);
    }
  }

  function pick(p: PublicUser) {
    if (p.hasPassword) {
      setSelected(p);
      setPassword('');
      setError('');
      setMode('password');
    } else {
      void doLogin(p.username);
    }
  }

  async function doRegister(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post('/auth/register', {
        username: form.username,
        displayName: form.displayName || undefined,
        password: form.password || undefined,
      });
      login(data.token, data.user);
    } catch (e) {
      setError(errorMessage(e, "Création impossible"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-vinyl via-mocha to-vinyl px-4 py-12 text-cream">
      <div className="mb-10 flex items-center gap-3">
        <Disc className="h-10 w-10 animate-spin-slow" />
        <h1 className="font-display text-4xl font-bold tracking-tight">Vinylarium</h1>
      </div>

      {mode === 'select' && (
        <>
          <p className="mb-8 text-cream/70">Qui écoute&nbsp;?</p>
          {isLoading ? (
            <Spinner />
          ) : (
            <div className="flex max-w-3xl flex-wrap items-start justify-center gap-6">
              {(profiles ?? []).map((p) => (
                <button
                  key={p.id}
                  onClick={() => pick(p)}
                  disabled={busy}
                  className="group flex w-28 flex-col items-center gap-2"
                >
                  <div className="transition-transform group-hover:-translate-y-1 group-hover:ring-2 group-hover:ring-accent rounded-2xl">
                    <BigAvatar user={p} />
                  </div>
                  <span className="text-sm font-medium">{p.displayName}</span>
                  {p.hasPassword && <span className="text-[10px] text-cream/50">🔒 protégé</span>}
                </button>
              ))}
              <button
                onClick={() => {
                  setForm({ username: '', displayName: '', password: '' });
                  setError('');
                  setMode('create');
                }}
                className="group flex w-28 flex-col items-center gap-2"
              >
                <div className="flex h-24 w-24 items-center justify-center rounded-2xl border-2 border-dashed border-cream/30 text-4xl text-cream/50 transition-colors group-hover:border-accent group-hover:text-accent">
                  +
                </div>
                <span className="text-sm font-medium text-cream/70">Nouveau profil</span>
              </button>
            </div>
          )}
          {error && <p className="mt-6 text-sm text-accent-soft">{error}</p>}
        </>
      )}

      {mode === 'password' && selected && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void doLogin(selected.username, password);
          }}
          className="w-full max-w-xs text-center"
        >
          <BigAvatar user={selected} />
          <h2 className="mb-1 mt-4 text-lg font-semibold">{selected.displayName}</h2>
          <p className="mb-4 text-sm text-cream/60">Saisis ton mot de passe</p>
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input text-ink"
            placeholder="Mot de passe"
          />
          {error && <p className="mt-3 text-sm text-accent-soft">{error}</p>}
          <div className="mt-5 flex gap-2">
            <button type="button" className="btn-outline flex-1 border-cream/30 text-cream" onClick={() => setMode('select')}>
              Retour
            </button>
            <button type="submit" disabled={busy} className="btn-primary flex-1">
              {busy ? '…' : 'Entrer'}
            </button>
          </div>
        </form>
      )}

      {mode === 'create' && (
        <form onSubmit={doRegister} className="card w-full max-w-sm p-6 text-ink">
          <h2 className="mb-1 font-display text-2xl font-bold">
            {setup?.needsSetup ? 'Bienvenue !' : 'Nouveau profil'}
          </h2>
          <p className="mb-5 text-sm text-mocha">
            {setup?.needsSetup
              ? 'Créez votre premier compte pour démarrer votre collection.'
              : 'Ajoutez un profil à la médiathèque.'}
          </p>
          <label className="label">Nom d'utilisateur</label>
          <input
            className="input mb-3"
            autoFocus
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            placeholder="ex. samy"
            required
          />
          <label className="label">Nom affiché (optionnel)</label>
          <input
            className="input mb-3"
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            placeholder="ex. Samy B."
          />
          <label className="label">Mot de passe (laisser vide = accès direct)</label>
          <input
            type="password"
            className="input"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="optionnel"
          />
          {error && <p className="mt-3 text-sm text-accent">{error}</p>}
          <div className="mt-5 flex gap-2">
            {!setup?.needsSetup && (
              <button type="button" className="btn-outline flex-1" onClick={() => setMode('select')}>
                Retour
              </button>
            )}
            <button type="submit" disabled={busy} className="btn-primary flex-1">
              {busy ? '…' : 'Créer le profil'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
