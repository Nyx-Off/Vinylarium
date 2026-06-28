import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../api/client';
import { useRelease, useStorageLocations } from '../api/hooks';
import { Credit, ReleaseDetail } from '../api/types';
import { Cover } from '../components/Cover';
import { Lightbox } from '../components/Lightbox';
import { Rating } from '../components/Rating';
import { Spinner } from '../components/Spinner';

function CreditGroup({ title, credits }: { title: string; credits: Credit[] }) {
  if (!credits.length) return null;
  return (
    <div className="mb-4">
      <h3 className="label">{title}</h3>
      <div className="flex flex-wrap gap-1.5">
        {credits.map((c) => {
          const role = c.detail ? `${c.role} (${c.detail})` : c.role;
          return (
            <Link
              key={c.id}
              to={`/artist/${c.artist.id}`}
              className="chip hover:bg-accent hover:text-cream"
              title={role + (c.tracks ? ` (${c.tracks})` : '')}
            >
              {c.artist.name}
              <span className="opacity-60">· {role}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="mb-3 font-display text-xl font-bold">{title}</h2>
      {children}
    </section>
  );
}

export default function ReleaseDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: r, isLoading } = useRelease(id);
  const { data: locations } = useStorageLocations();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ storageLocationId: '', storageSlot: '', tags: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [zoom, setZoom] = useState<number | null>(null); // index into `gallery`

  useEffect(() => {
    if (r) {
      setForm({
        storageLocationId: r.storage?.id ?? '',
        storageSlot: r.storage?.slot ?? '',
        tags: r.tags.map((t) => t.name).join(', '),
        notes: r.notes ?? '',
      });
    }
  }, [r]);

  if (isLoading) return <Spinner />;
  if (!r) return <p className="text-mocha">Disque introuvable.</p>;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['release', id] });
    qc.invalidateQueries({ queryKey: ['releases'] });
  };

  async function save() {
    setBusy(true);
    setMsg('');
    try {
      await api.patch(`/releases/${id}`, {
        storageLocationId: form.storageLocationId || null,
        storageSlot: form.storageSlot || null,
        notes: form.notes || null,
        tags: form.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      });
      invalidate();
      setEditing(false);
    } catch (e) {
      setMsg(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function reenrich() {
    setBusy(true);
    try {
      await api.post(`/releases/${id}/reenrich`);
      invalidate();
      setMsg('Enrichissement relancé.');
    } catch (e) {
      setMsg(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function fetchLyrics() {
    setBusy(true);
    try {
      await api.post(`/releases/${id}/lyrics/fetch`);
      setMsg('Recherche des paroles lancée (Genius). Recharge la page dans un instant.');
    } catch (e) {
      setMsg(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm('Supprimer ce disque de la collection ?')) return;
    await api.delete(`/releases/${id}`);
    qc.invalidateQueries({ queryKey: ['releases'] });
    navigate('/library');
  }

  // Hidden = absent from the library grids/bins but still searchable.
  async function toggleHidden() {
    setBusy(true);
    try {
      await api.patch(`/releases/${id}`, { hidden: !r!.hidden });
      invalidate();
      setMsg(r!.hidden ? 'Disque de nouveau visible dans la bibliothèque.' : 'Disque masqué de la bibliothèque (toujours trouvable via la recherche).');
    } catch (e) {
      setMsg(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const flags = [
    r.flags.isLive && 'Live',
    r.flags.isCompilation && 'Compilation',
    r.flags.isReissue && 'Réédition',
    r.flags.isRemaster && 'Remaster',
    r.flags.isSpecialEdition && 'Édition spéciale',
  ].filter(Boolean) as string[];

  // Every image Discogs provides, labelled by kind. Older entries (enriched
  // before full-gallery downloads) fall back to the two legacy cover paths.
  let photoNo = 0;
  const gallery: { src: string; label: string }[] = r.images
    .filter((i) => i.url)
    .map((i) => ({
      src: i.url!,
      label: i.type === 'PRIMARY' ? 'Recto' : i.type === 'BACK' ? 'Verso' : `Photo ${++photoNo}`,
    }));
  if (gallery.length === 0) {
    if (r.coverUrl) gallery.push({ src: r.coverUrl, label: 'Recto' });
    if (r.backCoverUrl) gallery.push({ src: r.backCoverUrl, label: 'Verso' });
  }
  const frontIdx = Math.max(0, gallery.findIndex((g) => g.label === 'Recto'));
  const zoomed = zoom != null ? gallery[zoom] : null;

  // Every instrument played on this record (Discogs credits), with players.
  // The detail qualifier is the exact model ("Synthesizer [Yamaha DX7]"), so
  // it gets its own chip; the search link still targets the base role.
  const instruments = new Map<string, { role: string; players: string[] }>();
  for (const c of r.credits) {
    if (c.category !== 'INSTRUMENT') continue;
    const label = c.detail ? `${c.role} · ${c.detail}` : c.role;
    const entry = instruments.get(label) ?? { role: c.role, players: [] };
    if (!entry.players.includes(c.artist.name)) entry.players.push(c.artist.name);
    instruments.set(label, entry);
  }
  const instrumentList = [...instruments.entries()].sort(
    (a, b) => b[1].players.length - a[1].players.length || a[0].localeCompare(b[0]),
  );

  return (
    <div>
      {zoomed && (
        <Lightbox
          src={zoomed.src}
          alt={`${zoomed.label} — ${r.title}`}
          onClose={() => setZoom(null)}
          onPrev={
            gallery.length > 1
              ? () => setZoom((z) => (z! + gallery.length - 1) % gallery.length)
              : undefined
          }
          onNext={gallery.length > 1 ? () => setZoom((z) => (z! + 1) % gallery.length) : undefined}
        />
      )}
      <Link to="/library" className="mb-4 inline-block text-sm text-mocha hover:text-accent">
        ← Retour à la bibliothèque
      </Link>

      <div className="grid gap-6 md:grid-cols-[300px_1fr]">
        {/* Cover column */}
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => gallery.length > 0 && setZoom(frontIdx)}
            className={`block aspect-square w-full overflow-hidden rounded-2xl shadow-sleeve ring-1 ring-ink/10 ${
              gallery.length > 0 ? 'cursor-zoom-in' : ''
            }`}
          >
            <Cover src={r.coverUrl} title={r.title} artist={r.artistDisplay} />
          </button>

          {/* All Discogs images: recto, verso, labels, inserts… */}
          {gallery.length > 1 && (
            <div className="grid grid-cols-3 gap-2">
              {gallery.map((g, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setZoom(idx)}
                  className="group relative aspect-square cursor-zoom-in overflow-hidden rounded-lg ring-1 ring-ink/10"
                  title={g.label}
                >
                  <img
                    src={g.src}
                    alt={g.label}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                  <span className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-ink/70 to-transparent px-1.5 pb-1 pt-3 text-[10px] font-medium text-cream/90">
                    {g.label}
                  </span>
                </button>
              ))}
            </div>
          )}
          <Rating value={r.rating} />
          <Link to={`/showcase/${r.id}`} className="btn-primary w-full justify-center text-center">
            ✦ Mode vitrine
          </Link>
          <div className="flex flex-wrap gap-2">
            {r.discogsUri && (
              <a href={r.discogsUri} target="_blank" rel="noreferrer" className="btn-outline text-xs">
                Voir sur Discogs ↗
              </a>
            )}
            {r.discogsReleaseId && (
              <button onClick={reenrich} disabled={busy} className="btn-ghost text-xs">
                Ré-enrichir
              </button>
            )}
            <button onClick={fetchLyrics} disabled={busy} className="btn-ghost text-xs">
              Récupérer les paroles
            </button>
            <button onClick={() => setEditing((v) => !v)} className="btn-ghost text-xs">
              {editing ? 'Annuler' : 'Modifier'}
            </button>
            <button
              onClick={toggleHidden}
              disabled={busy}
              className="btn-ghost text-xs"
              title="Un disque masqué disparaît de la bibliothèque mais reste trouvable via la recherche"
            >
              {r.hidden ? '👁 Afficher' : '🙈 Masquer'}
            </button>
            <button onClick={remove} className="btn-ghost text-xs text-accent">
              Supprimer
            </button>
          </div>
          {msg && <p className="text-xs text-accent">{msg}</p>}
        </div>

        {/* Main column */}
        <div className="space-y-5">
          <div>
            <h1 className="font-display text-4xl font-bold leading-tight">{r.title}</h1>
            <p className="mt-1 text-lg text-mocha">
              {r.artists.length > 0
                ? r.artists.map((a, i) => (
                    <span key={`${a.id}-${i}`}>
                      <Link to={`/artist/${a.id}`} className="hover:text-accent hover:underline">
                        {a.anv || a.name}
                      </Link>
                      {a.joinRel ? ` ${a.joinRel} ` : i < r.artists.length - 1 ? ', ' : ''}
                    </span>
                  ))
                : r.artistDisplay}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {r.year && <span className="chip">{r.year}</span>}
              {r.pressingYear && r.pressingYear !== r.year && (
                <span className="chip" title="Année de fabrication de ce pressage">
                  Pressage {r.pressingYear}
                </span>
              )}
              {r.hidden && (
                <span className="chip" title="Absent de la bibliothèque, trouvable via la recherche">
                  🙈 Masqué
                </span>
              )}
              {r.country && <span className="chip">{r.country}</span>}
              {r.labels.map((l) => (
                <span key={l.id} className="chip">
                  {l.name}
                  {l.catno ? ` · ${l.catno}` : ''}
                </span>
              ))}
              {flags.map((f) => (
                <span key={f} className="chip chip-active">
                  {f}
                </span>
              ))}
              {r.enrichmentStatus !== 'ENRICHED' && r.enrichmentStatus !== 'MANUAL' && (
                <span className="chip">⏳ {r.enrichmentStatus.toLowerCase()}</span>
              )}
            </div>
            {(r.genres.length > 0 || r.styles.length > 0) && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {r.genres.map((g) => (
                  <Link key={g} to={`/search?genre=${encodeURIComponent(g)}`} className="chip hover:bg-accent hover:text-cream">
                    {g}
                  </Link>
                ))}
                {r.styles.map((s) => (
                  <Link key={s} to={`/search?style=${encodeURIComponent(s)}`} className="chip hover:bg-accent hover:text-cream">
                    {s}
                  </Link>
                ))}
              </div>
            )}
            {instrumentList.length > 0 && (
              <div className="mt-4">
                <span className="label">Instruments sur ce disque</span>
                <div className="flex flex-wrap gap-1.5">
                  {instrumentList.map(([label, { role, players }]) => (
                    <Link
                      key={label}
                      to={`/search?role=${encodeURIComponent(role)}`}
                      className="chip hover:bg-accent hover:text-cream"
                      title={players.join(', ')}
                    >
                      ♪ {label}
                      {players.length > 1 && <span className="opacity-60">×{players.length}</span>}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {editing && (
            <div className="card space-y-3 p-5">
              <h2 className="font-display text-lg font-bold">Modifier</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">Emplacement</label>
                  <select
                    className="input"
                    value={form.storageLocationId}
                    onChange={(e) => setForm({ ...form, storageLocationId: e.target.value })}
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
                    value={form.storageSlot}
                    onChange={(e) => setForm({ ...form, storageSlot: e.target.value })}
                    placeholder="ex. 14"
                  />
                </div>
              </div>
              <div>
                <label className="label">Tags (séparés par des virgules)</label>
                <input
                  className="input"
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  placeholder="favori, à écouter, cadeau"
                />
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea
                  className="input min-h-[80px]"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
              <button onClick={save} disabled={busy} className="btn-primary">
                {busy ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          )}

          {/* Tracklist */}
          {r.tracklist.length > 0 && (
            <Section title="Tracklist">
              <ol className="divide-y divide-ink/5">
                {r.tracklist.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 py-1.5 text-sm">
                    <span className="w-10 shrink-0 font-mono text-xs text-mocha">{t.position}</span>
                    <span className="flex-1">{t.title}</span>
                    {t.duration && <span className="text-xs text-mocha">{t.duration}</span>}
                  </li>
                ))}
              </ol>
            </Section>
          )}

          {/* Lyrics */}
          {r.lyrics.length > 0 && (
            <Section title="Paroles">
              <div className="space-y-2">
                {r.lyrics.map((l) => {
                  const track = r.tracklist.find((t) => t.id === l.trackId);
                  return (
                    <details key={l.id} className="rounded-lg bg-ink/5 px-4 py-2">
                      <summary className="cursor-pointer text-sm font-semibold">
                        {track?.title ?? 'Paroles'}
                        {l.source === 'GENIUS' && <span className="ml-2 text-xs text-mocha">· Genius</span>}
                      </summary>
                      <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-mocha">{l.text}</pre>
                      {l.sourceUrl && (
                        <a
                          href={l.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-block text-xs text-accent hover:underline"
                        >
                          Source ↗
                        </a>
                      )}
                    </details>
                  );
                })}
              </div>
            </Section>
          )}

          {/* Line-up of each billed group when the record came out */}
          {r.lineup.length > 0 && (
            <Section title={r.year ? `Formation en ${r.year}` : 'Formation'}>
              {r.lineup.map((g) => (
                <div key={g.artistId} className="mb-3 last:mb-0">
                  {r.lineup.length > 1 && <h3 className="label">{g.artistName}</h3>}
                  <div className="grid gap-2 sm:grid-cols-2">
                    {g.members.map((m, idx) => {
                      const instr = m.attributes.filter((a) => a !== 'original');
                      const name = m.artistId ? (
                        <Link
                          to={`/artist/${m.artistId}`}
                          className="font-semibold hover:text-accent hover:underline"
                        >
                          {m.name}
                        </Link>
                      ) : (
                        <span className="font-semibold">{m.name}</span>
                      );
                      return (
                        <div key={idx} className="rounded-lg bg-ink/5 px-3 py-2 text-sm">
                          {name}
                          {instr.length > 0 && (
                            <span className="text-mocha"> — {instr.join(', ')}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              <p className="mt-3 text-xs text-mocha/60">
                Membres actifs à la sortie du disque, d'après MusicBrainz.
              </p>
            </Section>
          )}

          {/* Credits */}
          {r.credits.length > 0 && (
            <Section title="Crédits">
              <CreditGroup title="Musiciens" credits={r.musicians} />
              <CreditGroup title="Chant" credits={r.singers} />
              <CreditGroup title="Auteurs / compositeurs" credits={r.authors} />
              <CreditGroup title="Production" credits={r.producers} />
              <CreditGroup
                title="Autres"
                credits={r.credits.filter(
                  (c) => !['INSTRUMENT', 'VOCAL', 'WRITING', 'PRODUCTION'].includes(c.category),
                )}
              />
            </Section>
          )}

          {/* Storage */}
          {(r.storage || r.collectionFolder) && (
            <Section title="Rangement">
              {r.storage ? (
                r.storage.furnitureId ? (
                  <Link
                    to={`/storage?locate=${r.storage.id}${r.coverUrl ? `&cover=${encodeURIComponent(r.coverUrl)}` : ''}`}
                    className="group inline-flex items-center gap-1 text-sm text-accent hover:underline"
                    title="Voir l'emplacement dans le rangement 3D"
                  >
                    📍 {r.storage.label}
                    {r.storage.position ? ` · emplacement ${r.storage.position}` : ''}
                    <span className="text-mocha group-hover:text-accent"> — voir dans la pièce →</span>
                  </Link>
                ) : (
                  <p className="text-sm">
                    📍 {r.storage.label}
                    {r.storage.slot ? ` · position ${r.storage.slot}` : ''}
                  </p>
                )
              ) : (
                <p className="text-sm text-mocha">Dossier Discogs : {r.collectionFolder}</p>
              )}
            </Section>
          )}

          {/* Notes */}
          {r.notes && (
            <Section title="Notes">
              <p className="whitespace-pre-wrap text-sm text-mocha">{r.notes}</p>
            </Section>
          )}

          {/* Anecdotes */}
          {r.anecdotes.length > 0 && (
            <Section title="Anecdotes">
              {r.anecdotes.map((a) => (
                <div key={a.id} className="mb-4 last:mb-0">
                  {a.title && <h4 className="font-semibold">{a.title}</h4>}
                  <p className="whitespace-pre-wrap text-sm text-mocha">{a.body}</p>
                  {a.sourceUrl && (
                    <a
                      href={a.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block text-xs text-accent hover:underline"
                    >
                      {a.source === 'GENIUS' ? 'Genius' : 'Source'} ↗
                    </a>
                  )}
                </div>
              ))}
            </Section>
          )}

          {/* Identifiers */}
          {r.identifiers.length > 0 && (
            <Section title="Identifiants">
              <ul className="space-y-1 text-sm text-mocha">
                {r.identifiers.map((i, idx) => (
                  <li key={idx}>
                    <span className="font-medium text-ink">{i.type}:</span> {i.value}
                    {i.description ? ` (${i.description})` : ''}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
