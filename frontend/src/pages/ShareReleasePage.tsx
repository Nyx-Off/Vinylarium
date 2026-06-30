import { Link, useParams } from 'react-router-dom';
import { usePublicRelease } from '../api/hooks';
import { Cover } from '../components/Cover';
import { Spinner } from '../components/Spinner';

export default function ShareReleasePage() {
  const { token, id } = useParams();
  const { data: r, isLoading, isError } = usePublicRelease(token, id);

  if (isLoading) return <Spinner label="Chargement…" />;
  if (isError || !r) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="card max-w-md p-8 text-center">
          <h1 className="mb-2 font-display text-2xl font-bold">Disque introuvable</h1>
          <Link to={`/share/${token}`} className="btn-outline mt-2 inline-block">
            ← Retour à la collection
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <Link to={`/share/${token}`} className="text-sm text-accent hover:underline">
        ← Retour à la collection
      </Link>

      <div className="mt-4 grid gap-6 md:grid-cols-[280px_1fr]">
        <div className="space-y-3">
          <div className="aspect-square overflow-hidden rounded-xl shadow-sleeve ring-1 ring-ink/10">
            <Cover src={r.coverUrl} title={r.title} artist={r.artistDisplay} />
          </div>
          {r.backCoverUrl && (
            <div className="aspect-square overflow-hidden rounded-xl ring-1 ring-ink/10">
              <Cover src={r.backCoverUrl} title={r.title} artist={r.artistDisplay} />
            </div>
          )}
        </div>

        <div>
          <h1 className="font-display text-3xl font-bold">{r.title}</h1>
          <p className="mt-1 text-lg text-mocha">{r.artistDisplay}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {r.year && <span className="chip">{r.year}</span>}
            {r.country && <span className="chip">{r.country}</span>}
            {r.labels.map((l) => (
              <span key={l.id} className="chip">
                {l.name}
                {l.catno ? ` · ${l.catno}` : ''}
              </span>
            ))}
            {r.genres.map((g) => (
              <span key={g} className="chip chip-active">
                {g}
              </span>
            ))}
            {r.styles.map((s) => (
              <span key={s} className="chip">
                {s}
              </span>
            ))}
          </div>

          {r.tracklist.length > 0 && (
            <section className="mt-6">
              <h2 className="mb-2 font-display text-xl font-bold">Tracklist</h2>
              <ol className="space-y-1">
                {r.tracklist.map((t) => (
                  <li key={t.id} className="flex justify-between gap-3 border-b border-ink/5 py-1 text-sm">
                    <span>
                      {t.position && <span className="mr-2 text-mocha/60">{t.position}</span>}
                      {t.title}
                    </span>
                    {t.duration && <span className="text-mocha/60">{t.duration}</span>}
                  </li>
                ))}
              </ol>
            </section>
          )}

          {r.credits.length > 0 && (
            <section className="mt-6">
              <h2 className="mb-2 font-display text-xl font-bold">Crédits</h2>
              <div className="flex flex-wrap gap-1.5">
                {r.credits.map((c) => (
                  <span key={c.id} className="chip" title={c.role}>
                    {c.artist.name}
                    <span className="opacity-60">· {c.detail ? `${c.role} (${c.detail})` : c.role}</span>
                  </span>
                ))}
              </div>
            </section>
          )}

          {r.lyrics.length > 0 && (
            <section className="mt-6">
              <h2 className="mb-2 font-display text-xl font-bold">Paroles</h2>
              <div className="space-y-2">
                {r.lyrics.map((l) => {
                  const track = r.tracklist.find((t) => t.id === l.trackId);
                  return (
                    <details key={l.id} className="rounded-lg bg-ink/5 px-4 py-2">
                      <summary className="cursor-pointer text-sm font-semibold">
                        {track?.title ?? 'Paroles'}
                      </summary>
                      <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-mocha">{l.text}</pre>
                    </details>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </div>
      <footer className="mt-10 text-center text-xs text-mocha/60">Propulsé par Vinylarium</footer>
    </div>
  );
}
