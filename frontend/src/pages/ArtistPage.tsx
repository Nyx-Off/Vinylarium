import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { useArtist } from '../api/hooks';
import { BandMember } from '../api/types';
import { ReleaseCard } from '../components/ReleaseCard';
import { Spinner } from '../components/Spinner';

/** "1968-07-23" → "1968" (MusicBrainz dates are at most year-month-day). */
const year = (d: string | null) => (d ? d.slice(0, 4) : null);

function periodLabel(m: BandMember): string | null {
  const from = year(m.beginDate);
  const to = year(m.endDate);
  if (from && to) return `${from} – ${to}`;
  if (from) return m.ended ? `depuis ${from} (parti)` : `depuis ${from}`;
  if (to) return `jusqu'en ${to}`;
  return m.ended ? 'ancien membre' : null;
}

function MemberCard({ m }: { m: BandMember }) {
  const founder = m.attributes.includes('original');
  const instruments = m.attributes.filter((a) => a !== 'original');
  const period = periodLabel(m);
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className={`font-semibold leading-tight ${m.ended ? 'text-mocha' : ''}`}>{m.name}</p>
        {founder && <span className="chip chip-active shrink-0 text-[10px]">Fondateur</span>}
      </div>
      {instruments.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {instruments.map((i) => (
            <span key={i} className="chip text-[10px]">
              {i}
            </span>
          ))}
        </div>
      )}
      {period && <p className="mt-1.5 text-xs text-mocha/70">{period}</p>}
    </>
  );

  const cls = `card block p-3 ${m.ended ? 'opacity-75' : ''}`;
  return m.artistId ? (
    <Link to={`/artist/${m.artistId}`} className={`${cls} transition-transform hover:-translate-y-0.5`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export default function ArtistPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: a, isLoading } = useArtist(id);
  const [msg, setMsg] = useState('');

  if (isLoading) return <Spinner />;
  if (!a) return <p className="text-mocha">Artiste introuvable.</p>;

  const isGroup = a.type === 'Group' || a.members.length > 0;
  const from = year(a.beginDate);
  const to = year(a.endDate);
  const years = from ? (to ? `${from} – ${to}` : `depuis ${from}`) : null;
  const current = a.members.filter((m) => !m.ended);
  const past = a.members.filter((m) => m.ended);
  const mbPending = ['PENDING', 'FAILED'].includes(a.relationsStatus) && a.mbid;

  async function refresh() {
    setMsg('');
    try {
      await api.post(`/artists/${id}/refresh`);
      setMsg('Mise à jour MusicBrainz lancée — recharge la page dans un instant.');
    } catch (e) {
      setMsg(errorMessage(e));
    }
  }

  return (
    <div>
      <button onClick={() => navigate(-1)} className="mb-4 text-sm text-mocha hover:text-accent">
        ← Retour
      </button>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl font-bold leading-tight">{a.name}</h1>
          {a.realName && <p className="mt-1 text-sm text-mocha">{a.realName}</p>}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {a.type && <span className="chip chip-active">{isGroup ? 'Groupe' : 'Artiste'}</span>}
            {a.origin && (
              <Link to={`/search?origin=${a.origin.code}`} className="chip hover:bg-accent hover:text-cream">
                📍 {a.origin.name}
              </Link>
            )}
            {years && <span className="chip">{years}</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/search?artistId=${a.id}`} className="btn-outline text-xs">
            Tous ses disques
          </Link>
          <button onClick={refresh} className="btn-ghost text-xs" title="Re-consulter MusicBrainz">
            ↻ MusicBrainz
          </button>
        </div>
      </div>
      {msg && <p className="mt-2 text-xs text-accent">{msg}</p>}

      {/* Band membership (for persons) */}
      {a.memberOf.length > 0 && (
        <p className="mt-4 text-sm text-mocha">
          Membre de{' '}
          {a.memberOf.map((g, i) => (
            <span key={g.artistId}>
              {i > 0 && ', '}
              <Link to={`/artist/${g.artistId}`} className="font-semibold text-accent hover:underline">
                {g.name}
              </Link>
            </span>
          ))}
        </p>
      )}

      {/* Members */}
      {a.members.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 font-display text-2xl font-bold">
            Membres <span className="text-base font-normal text-mocha">({a.members.length})</span>
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {current.map((m) => (
              <MemberCard key={m.id} m={m} />
            ))}
          </div>
          {past.length > 0 && (
            <>
              <h3 className="label mt-5">Anciens membres</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {past.map((m) => (
                  <MemberCard key={m.id} m={m} />
                ))}
              </div>
            </>
          )}
        </section>
      )}
      {isGroup && a.members.length === 0 && mbPending && (
        <p className="mt-6 text-sm text-mocha/70">
          ⏳ Les informations MusicBrainz (membres, période) arrivent — le worker les récupère en
          arrière-plan.
        </p>
      )}

      {/* Releases in the collection */}
      {a.releases.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 font-display text-2xl font-bold">
            Dans la collection{' '}
            <span className="text-base font-normal text-mocha">({a.releases.length})</span>
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {a.releases.map((r) => (
              <ReleaseCard key={r.id} r={r} />
            ))}
          </div>
        </section>
      )}

      {/* Credited appearances */}
      {a.appearsOn.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 font-display text-2xl font-bold">
            Apparaît aussi sur{' '}
            <span className="text-base font-normal text-mocha">({a.appearsOn.length})</span>
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {a.appearsOn.map((r) => (
              <div key={r.id}>
                <ReleaseCard r={r} />
                {r.roles.length > 0 && (
                  <p className="mt-1 line-clamp-1 px-0.5 text-[11px] text-mocha/70">
                    {r.roles.join(', ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {a.releases.length === 0 && a.appearsOn.length === 0 && (
        <p className="mt-8 text-mocha">Aucun disque de cet artiste dans la collection.</p>
      )}
    </div>
  );
}
