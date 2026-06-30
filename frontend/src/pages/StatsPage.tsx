import { Link } from 'react-router-dom';
import { useStats } from '../api/hooks';
import { Spinner } from '../components/Spinner';

function Kpi({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="card px-4 py-3">
      <div className="font-display text-3xl font-bold text-accent">{value.toLocaleString('fr-FR')}</div>
      <div className="text-sm font-medium">{label}</div>
      {hint && <div className="text-xs text-mocha/70">{hint}</div>}
    </div>
  );
}

type Row = { label: string; count: number; to?: string };

function BarList({ title, rows }: { title: string; rows: Row[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (rows.length === 0) return null;
  return (
    <div className="card p-4">
      <h2 className="label mb-3">{title}</h2>
      <div className="space-y-2">
        {rows.map((r) => {
          const content = (
            <div className="flex items-center gap-3">
              <span className="w-40 shrink-0 truncate text-sm font-medium" title={r.label}>
                {r.label}
              </span>
              <div className="relative h-5 flex-1 overflow-hidden rounded bg-ink/5">
                <div
                  className="h-full rounded bg-accent/80"
                  style={{ width: `${(r.count / max) * 100}%` }}
                />
              </div>
              <span className="w-10 shrink-0 text-right font-display text-sm font-bold">
                {r.count}
              </span>
            </div>
          );
          return r.to ? (
            <Link
              key={r.label}
              to={r.to}
              className="block rounded transition-transform hover:-translate-y-0.5"
            >
              {content}
            </Link>
          ) : (
            <div key={r.label}>{content}</div>
          );
        })}
      </div>
    </div>
  );
}

export default function StatsPage() {
  const { data, isLoading } = useStats();

  if (isLoading || !data) return <Spinner label="Chargement des statistiques…" />;

  const t = data.totals;
  const enc = encodeURIComponent;

  // Stars 1..5 — fill any gaps so the distribution always shows the full scale.
  const ratingByStar = new Map(data.ratings.map((r) => [r.rating, r.count]));
  const ratingRows: Row[] = [5, 4, 3, 2, 1].map((star) => ({
    label: '★'.repeat(star) + '☆'.repeat(5 - star),
    count: ratingByStar.get(star) ?? 0,
    to: `/search?minRating=${star}`,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-display text-3xl font-bold">Statistiques</h1>
          <p className="mt-1 text-sm text-mocha">Un aperçu chiffré de votre collection.</p>
        </div>
        <Link to="/duplicates" className="btn-ghost text-sm">
          Détecter les doublons →
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Kpi label="Disques" value={t.releases} />
        <Kpi label="Artistes" value={t.artists} />
        <Kpi label="Labels" value={t.labels} />
        <Kpi
          label="Enrichis"
          value={t.enriched}
          hint={t.releases ? `${Math.round((t.enriched / t.releases) * 100)} %` : undefined}
        />
        <Kpi
          label="Avec paroles"
          value={t.withLyrics}
          hint={t.releases ? `${Math.round((t.withLyrics / t.releases) * 100)} %` : undefined}
        />
        <Kpi label="Notés" value={t.rated} />
        <Kpi label="En concert" value={t.live} />
        <Kpi label="Masqués" value={t.hidden} />
      </div>

      {t.pendingEnrichment > 0 && (
        <p className="text-xs text-mocha/70">
          ⏳ {t.pendingEnrichment} disque{t.pendingEnrichment > 1 ? 's' : ''} encore en cours
          d'enrichissement.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <BarList
          title="Par décennie"
          rows={data.byDecade.map((d) => ({
            label: `${d.decade}s`,
            count: d.count,
            to: `/search?decade=${d.decade}`,
          }))}
        />
        <BarList
          title="Genres"
          rows={data.topGenres.map((g) => ({
            label: g.name,
            count: g.count,
            to: `/search?genre=${enc(g.name)}`,
          }))}
        />
        <BarList
          title="Artistes les plus présents"
          rows={data.topArtists.map((a) => ({
            label: a.name,
            count: a.count,
            to: `/artist/${a.id}`,
          }))}
        />
        <BarList
          title="Labels"
          rows={data.topLabels.map((l) => ({
            label: l.name,
            count: l.count,
            to: `/search?label=${enc(l.name)}`,
          }))}
        />
        <BarList
          title="Pays de pressage"
          rows={data.topCountries.map((c) => ({
            label: c.name,
            count: c.count,
            to: `/search?country=${enc(c.name)}`,
          }))}
        />
        <BarList title="Formats" rows={data.formats.map((f) => ({ label: f.name, count: f.count }))} />
        {data.ratings.length > 0 && <BarList title="Notes" rows={ratingRows} />}
      </div>
    </div>
  );
}
