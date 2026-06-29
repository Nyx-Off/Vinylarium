import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../api/client';

/** Spotify redirects here with ?code&state after the user authorises. */
export default function SpotifyCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [error, setError] = useState('');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const code = params.get('code');
    const state = params.get('state');
    const expected = localStorage.getItem('spotify_state');
    localStorage.removeItem('spotify_state');
    if (params.get('error')) {
      setError('Connexion refusée par Spotify.');
      return;
    }
    if (!code || !state || state !== expected) {
      setError('Lien de connexion invalide ou expiré.');
      return;
    }
    (async () => {
      try {
        await api.post('/spotify/callback', {
          code,
          redirectUri: `${window.location.origin}/spotify/callback`,
        });
        qc.invalidateQueries({ queryKey: ['spotify-status'] });
        qc.invalidateQueries({ queryKey: ['spotify-now'] });
        navigate('/settings', { replace: true });
      } catch (e) {
        setError(errorMessage(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-mocha">
      {error ? (
        <>
          <p className="text-accent">Spotify : {error}</p>
          <Link to="/settings" className="text-accent underline">
            Retour aux paramètres
          </Link>
        </>
      ) : (
        <p>Connexion à Spotify…</p>
      )}
    </div>
  );
}
