// apps/server/src/app.ts (owner: Dev A)
// Builds the control-plane Fastify app (:4000, prefix /api). Registers every route
// plugin: A's own routes here, B's and C's through their register* functions.
// Stubs answer 501 with the ApiError shape so teammates can build against the API
// surface from hour 0; each owner replaces their own module, never this file.
import Fastify, { type FastifyInstance, type RouteOptions } from 'fastify';
import { AppError, USER_HEADER } from '@patchwork/shared';
import type { ServiceRegistry } from '@patchwork/shared';
import type { Db } from './db/sqlite.js';
import { installApiErrorHandling } from './core/http.js';
import { registerCoreRoutes } from './core/routes.js';
import type { MergeEngine } from './core/merge.js';
import { registerSnapshotRoutes } from './snapshots/index.js';
import { registerVerifyRoutes } from './verify/index.js';
import { registerReleaseRoutes } from './releases/index.js';
import { registerDriftRoutes } from './drift/index.js';

export interface AppOptions {
  registry: ServiceRegistry;
  db: Db;
  logger?: boolean;
  /** Test seam for T-API-MERGE; production omits it and the real engine is used. */
  mergeEngine?: MergeEngine;
}

/** A-owned control routes that are still 501 stubs until Phase 2 (step 14).
 *
 * Ownership rule: Dev A registers ONLY A-owned routes here (the rest live in
 * core/routes.ts). Dev B and Dev C register their own routes inside their own
 * register* functions. If Dev A pre-registers another dev's routes, Fastify throws
 * FST_ERR_DUPLICATED_ROUTES at boot the moment the owner lands the real route.
 * Unregistered routes answer with the 404 ApiError response from
 * setNotFoundHandler below. */
export const STUB_ROUTES: Array<Pick<RouteOptions, 'method' | 'url'> & { phase: string }> = [
  { method: 'POST', url: '/api/projects/:pid/previews', phase: 'Phase 2 step 14' },
  { method: 'PUT', url: '/api/previews/:id', phase: 'Phase 2 step 14' },
];

export function buildControlApp(opts: AppOptions): FastifyInstance {
  const { registry, db } = opts;
  const app = Fastify({ logger: opts.logger ?? false });

  // Shared ApiError rendering (request id, error handler, not-found). The live and
  // preview gateways call the same helper from main.ts, so all three instances agree.
  installApiErrorHandling(app);

  // Identity: a picker, not auth (PLAN section 16 "Honest limits"). Unknown user -> 403.
  app.addHook('preHandler', async (req) => {
    if (!req.url.startsWith('/api')) return;
    const header = req.headers[USER_HEADER];
    if (typeof header === 'string' && header !== '') {
      const row = db.prepare('SELECT id FROM users WHERE id = ?').get(header);
      if (!row) {
        throw new AppError('FORBIDDEN', `Unknown user "${header}" (header ${USER_HEADER})`);
      }
    }
  });

  // --- A-owned routes (users, projects, patches, validate, submit, reviews, merge, audit) --
  registerCoreRoutes(app, { registry, db, engine: opts.mergeEngine });

  // --- stub routes (501, ApiError shape); A-owned only (see STUB_ROUTES comment) --
  for (const route of STUB_ROUTES) {
    app.route({
      method: route.method,
      url: route.url,
      handler: () => {
        throw new AppError(
          'NOT_IMPLEMENTED',
          `${route.method} ${route.url} arrives in ${route.phase} (owner: Dev A)`,
        );
      },
    });
  }

  // --- B's and C's route plugins --------------------------------------------
  registerSnapshotRoutes(app, registry);
  registerVerifyRoutes(app, registry);
  registerReleaseRoutes(app, registry);
  registerDriftRoutes(app, registry);

  return app;
}
