import { Link } from 'react-router-dom';
import { useNowPlaying, useSpotifyStatus } from '../api/hooks';

/** Three bars dancing — the "a track is playing" indicator. */
function Equalizer({ className = '' }: { className?: string }) {
  return (
    <span className={`flex h-3.5 items-end gap-[2px] ${className}`} aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-[2px] animate-eq rounded-full bg-accent"
          style={{ height: '100%', animationDelay: `${i * 0.18}s` }}
        />
      ))}
    </span>
  );
}

/**
 * Compact header indicator: the cover + an equalizer, plus the title/artist on
 * wide screens. Hidden entirely when not connected or nothing is playing.
 * Links to Paramètres (where the full card + connection controls live).
 */
export function NowPlayingPill() {
  const { data: status } = useSpotifyStatus();
  const connected = Boolean(status?.connected);
  const { data: np } = useNowPlaying(connected);
  if (!connected || !np?.playing) return null;
  return (
    <Link
      to="/settings"
      title={`${np.title ?? ''}${np.artist ? ` — ${np.artist}` : ''}`}
      className="flex min-w-0 items-center gap-2 rounded-full bg-ink/5 px-2 py-1 hover:bg-ink/10"
    >
      {np.coverUrl ? (
        <img src={np.coverUrl} alt="" className="h-7 w-7 shrink-0 rounded object-cover" />
      ) : (
        <span className="text-base leading-none">🎧</span>
      )}
      <Equalizer className="shrink-0" />
      <span className="hidden min-w-0 max-w-[180px] lg:block">
        <span className="block truncate text-xs font-semibold leading-tight text-ink">{np.title}</span>
        <span className="block truncate text-[10px] leading-tight text-mocha">{np.artist}</span>
      </span>
    </Link>
  );
}

/**
 * Fuller "now playing" card for the Spotify section of Paramètres: cover,
 * title (linking out to the track), artist · album and a progress bar.
 * Renders nothing until the account is connected.
 */
export function NowPlayingCard() {
  const { data: status } = useSpotifyStatus();
  const connected = Boolean(status?.connected);
  const { data: np } = useNowPlaying(connected);
  if (!connected) return null;
  if (!np?.playing) {
    return <p className="text-sm text-mocha">Rien en cours d'écoute sur Spotify.</p>;
  }
  const pct = np.durationMs ? Math.min(100, ((np.progressMs ?? 0) / np.durationMs) * 100) : 0;
  return (
    <div className="flex items-center gap-4 rounded-xl bg-ink/5 p-3">
      {np.coverUrl && (
        <img src={np.coverUrl} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover shadow" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Equalizer />
          <span className="text-[10px] font-semibold uppercase tracking-wide text-mocha">
            En cours d'écoute
          </span>
        </div>
        <p className="mt-0.5 truncate font-semibold text-ink">
          {np.trackUrl ? (
            <a href={np.trackUrl} target="_blank" rel="noreferrer" className="hover:text-accent hover:underline">
              {np.title}
            </a>
          ) : (
            np.title
          )}
        </p>
        <p className="truncate text-sm text-mocha">
          {np.artist}
          {np.album ? ` · ${np.album}` : ''}
        </p>
        {np.durationMs ? (
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-ink/10">
            <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
