import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
import { badRequest, notFound } from '../../lib/errors';
import { saveBuffer } from '../../lib/storage';
import { importQueue } from '../../lib/queue';

export async function importRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // Upload a Discogs collection CSV export and queue it for processing.
  app.post('/', async (req) => {
    const file = await req.file();
    if (!file) throw badRequest('No CSV file uploaded');
    if (!/\.csv$/i.test(file.filename || '')) {
      // Discogs exports are .csv; be lenient but warn.
      req.log.warn(`Import file "${file.filename}" is not a .csv`);
    }
    const buf = await file.toBuffer();
    if (buf.length === 0) throw badRequest('Uploaded file is empty');

    const job = await prisma.importJob.create({
      data: { filename: file.filename || 'collection.csv', userId: req.user.sub, status: 'PENDING' },
    });
    const rel = await saveBuffer('imports', `${job.id}.csv`, buf);
    await prisma.importJob.update({ where: { id: job.id }, data: { storedFilePath: rel } });

    await importQueue.add('import', { importJobId: job.id });
    return job;
  });

  // Recent import jobs.
  app.get('/', async () => {
    const jobs = await prisma.importJob.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
    return { jobs };
  });

  // Single job status (polled by the UI for progress).
  app.get('/:id', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const job = await prisma.importJob.findUnique({ where: { id } });
    if (!job) throw notFound('Import job not found');
    return job;
  });
}
