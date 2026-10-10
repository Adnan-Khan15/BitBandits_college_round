// apps/server/src/main.ts (owner: Dev A)
// One Node process, three listeners (PLAN section 9):
//   control plane :4000 (/api, serves apps/web/dist in start mode)
//   live gateway  :4100  (serves only the active release)
//   preview gateway :4300 (serves whatever the pw_preview cookie selects)
// Only this file's entry-point guard calls main(); importing anything from here never starts servers.
import Fastify from 'fastify';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { buildControlApp } from './app.js';
import { openDb, type Db } from './db/sqlite.js';
import { migrate } from './db/migrate.js';
import { loadEnvFromDisk } from './env.js';
import { buildRegistry } from './registry.js';
import { installApiErrorHandling } from './core/http.js';
import { registerGatewayRoutes } from './gateway/index.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

async function main(): Promise<void> {
  const env = await loadEnvFromDisk(join(repoRoot, '.env'));

  const db: Db = openDb(env.PW_DB_PATH);
  migrate(db);

  const registry = buildRegistry(db);

  // Control plane (:4000)
  const control = buildControlApp({ registry, db, logger: true });
  await control.listen({ port: env.PW_CONTROL_PORT, host: '127.0.0.1' });

  // Serve the built web app in start mode (PLAN section 17: npm run build && npm start).
  const webDist = join(repoRoot, 'apps', 'web', 'dist');
  if (existsSync(join(webDist, 'index.html'))) {
    const { default: fastifyStatic } = await import('@fastify/static');
    await control.register(fastifyStatic, { root: webDist });
    control.log.info(`serving ${webDist} at http://localhost:${env.PW_CONTROL_PORT}`);
  }

  // Live gateway (:4100) - only the active release, never reads the preview cookie.
  const live = Fastify({ logger: true });
  installApiErrorHandling(live);
  registerGatewayRoutes(live, registry, 'live');
  await live.listen({ port: env.PW_LIVE_PORT, host: '127.0.0.1' });

  // Preview gateway (:4300) - cookie-scoped preview, never falls back to live.
  const preview = Fastify({ logger: true });
  installApiErrorHandling(preview);
  registerGatewayRoutes(preview, registry, 'preview');
  await preview.listen({ port: env.PW_PREVIEW_PORT, host: '127.0.0.1' });

  console.log(
    `[patchwork] control :${env.PW_CONTROL_PORT} | live :${env.PW_LIVE_PORT} | preview :${env.PW_PREVIEW_PORT} | db ${env.PW_DB_PATH}`,
  );

  const shutdown = async (): Promise<void> => {
    await Promise.allSettled([control.close(), live.close(), preview.close()]);
    db.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

// Entry-point guard: run main() only when executed directly (tsx apps/server/src/main.ts),
// never when imported by a test or another module.
const invokedDirectly =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  main().catch((err: unknown) => {
    console.error('[patchwork] failed to start:', err);
    process.exit(1);
  });
}
