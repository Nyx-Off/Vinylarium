import { buildApp } from './app';
import { config } from './config';
import { ensureStorageDirs } from './lib/storage';
import { seedRoles } from './lib/seed';
import { scheduleDailyUpdateCheck } from './lib/update';

async function main() {
  await ensureStorageDirs();
  await seedRoles();

  const app = await buildApp();
  await app.listen({ host: config.host, port: config.port });
  app.log.info(`Vinylarium API listening on ${config.host}:${config.port}`);

  // Once a day, compare the host checkout against GitHub (result cached for
  // the Settings page; the manual "Vérifier" button does the same on demand).
  scheduleDailyUpdateCheck((msg) => app.log.info(msg));
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
