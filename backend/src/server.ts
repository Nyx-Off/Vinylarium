import { buildApp } from './app';
import { config } from './config';
import { ensureStorageDirs } from './lib/storage';
import { seedRoles } from './lib/seed';

async function main() {
  await ensureStorageDirs();
  await seedRoles();

  const app = await buildApp();
  await app.listen({ host: config.host, port: config.port });
  app.log.info(`Vinylarium API listening on ${config.host}:${config.port}`);
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
