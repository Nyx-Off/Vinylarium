import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../api/client';
import { useImportJob, useImportJobs } from '../api/hooks';

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'En attente',
  PARSING: 'Lecture du fichier',
  ENRICHING: 'Enrichissement',
  COMPLETED: 'Terminé',
  FAILED: 'Échec',
};

export default function ImportPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [jobId, setJobId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const { data: job } = useImportJob(jobId, true);
  const { data: jobs } = useImportJobs();

  const done = job && (job.status === 'COMPLETED' || job.status === 'FAILED');
  if (done) {
    // refresh history + library once finished
    qc.invalidateQueries({ queryKey: ['imports'] });
    qc.invalidateQueries({ queryKey: ['releases'] });
  }

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError('Choisissez un fichier CSV.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post('/import', fd);
      setJobId(data.id);
      qc.invalidateQueries({ queryKey: ['imports'] });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const pct = job && job.totalRows > 0 ? Math.round((job.processedRows / job.totalRows) * 100) : 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Import Discogs</h1>
        <p className="text-sm text-mocha">
          Exportez votre collection depuis Discogs (Collection → Exporter) puis déposez le fichier
          CSV ici. Vinylarium récupère ensuite les pochettes, crédits et détails via l'API Discogs.
        </p>
      </div>

      <div className="card space-y-4 p-6">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-accent file:px-4 file:py-2 file:text-cream hover:file:bg-accent-deep"
        />
        <button onClick={upload} disabled={busy} className="btn-primary">
          {busy ? 'Envoi…' : 'Importer la collection'}
        </button>
        {error && <p className="text-sm text-accent">{error}</p>}

        {job && (
          <div className="rounded-xl bg-ink/5 p-4">
            <div className="mb-2 flex justify-between text-sm">
              <span className="font-medium">{STATUS_LABEL[job.status] ?? job.status}</span>
              <span className="text-mocha">
                {job.processedRows}/{job.totalRows}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-ink/10">
              <div
                className="h-full bg-accent transition-all"
                style={{ width: `${job.status === 'COMPLETED' ? 100 : pct}%` }}
              />
            </div>
            <div className="mt-3 flex gap-4 text-xs text-mocha">
              <span>✅ {job.importedCount} importés</span>
              <span>↩︎ {job.skippedCount} doublons</span>
              <span>⚠︎ {job.failedCount} ignorés</span>
            </div>
            {job.status === 'COMPLETED' && (
              <p className="mt-2 text-sm text-mocha">
                Import terminé. Les pochettes apparaissent au fur et à mesure de l'enrichissement.
              </p>
            )}
            {job.error && <p className="mt-2 text-sm text-accent">{job.error}</p>}
          </div>
        )}
      </div>

      {jobs && jobs.length > 0 && (
        <div className="card p-6">
          <h2 className="mb-3 font-display text-xl font-bold">Historique</h2>
          <ul className="divide-y divide-ink/5 text-sm">
            {jobs.map((j) => (
              <li key={j.id} className="flex items-center justify-between py-2">
                <span className="truncate">{j.filename}</span>
                <span className="text-xs text-mocha">
                  {STATUS_LABEL[j.status] ?? j.status} · {j.importedCount} importés
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
