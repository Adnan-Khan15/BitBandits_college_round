// apps/server/src/app.ts (owner: Dev A)
// Builds the control-plane Fastify app (:4000, prefix /api). Registers every route
// plugin: A's own routes here, B's and C's through their register* functions.
// Stubs answer 501 with the ApiError shape so teammates can build against the API
// surface from hour 0; each owner replaces their own module, never this file.
import Fastify, { type FastifyInstance, type RouteOptions } from 'fastify';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { AppError, isAppError, USER_HEADER } from '@patchwork/shared';
import type { ServiceRegistry } from '@patchwork/shared';
import type { Db } from './db/sqlite.js';
import { registerSnapshotRoutes } from './snapshots/index.js';
import { registerVerifyRoutes } from './verify/index.js';
import { registerReleaseRoutes } from './releases/index.js';
import { registerDriftRoutes } from './drift/index.js';

export interface AppOptions {
  registry: ServiceRegistry;
  db: Db;
  logger?: boolean;
}

/** Every A-owned control route that is still a stub until Phase 2 (steps 10-15). */
const STUB_ROUTES: Array<Pick<RouteOptions, 'method' | 'url'> & { owner: string; phase: string }> = [
  { method: 'GET', url: '/api/projects/:pid/patches', owner: 'A', phase: 'Phase 2 step 12' },
  { method: 'POST', url: '/api/projects/:pid/patches', owner: 'A', phase: 'Phase 2 step 12' },
  { method: 'GET', url: '/api/patches/:id', owner: 'A', phase: 'Phase 2 step 12' },
  { method: 'PUT', url: '/api/patches/:id', owner: 'A', phase: 'Phase 2 step 12' },
  { method: 'POST', url: '/api/patches/:id/validate', owner: 'A', phase: 'Phase 2 step 10' },
  { method: 'POST', url: '/api/patches/:id/submit', owner: 'A', phase: 'Phase 2 step 12' },
  { method: 'POST', url: '/api/patches/:id/reviews', owner: 'A', phase: 'Phase 2 step 12' },
  { method: 'POST', url: '/api/patches/:id/merge', owner: 'A', phase: 'Phase 2 step 13' },
  { method: 'POST', url: '/api/projects/:pid/conflicts', owner: 'A', phase: 'Phase 2 step 13' },
  { method: 'POST', url: '/api/projects/:pid/previews', owner: 'A', phase: 'Phase 2 step 14' },
  { method: 'PUT', url: '/api/previews/:id', owner: 'A', phase: 'Phase 2 step 14' },
  { method: 'GET', url: '/api/projects/:pid/audit', owner: 'A', phase: 'Phase 2 step 15' },
  { method: 'GET', url: '/api/projects/:pid/audit/verify', owner: 'A', phase: 'Phase 2 step 11' },
  // B's and C's control routes: 501 until their owners land them.
  { method: 'POST', url: '/api/projects/:pid/snapshots', owner: 'C', phase: 'Phase 2 (C)' },
  { method: 'GET', url: '/api/projects/:pid/releases', owner: 'C', phase: 'Phase 2 (C)' },
  { method: 'POST', url: '/api/projects/:pid/releases', owner: 'C', phase: 'Phase 2 (C)' },
  { method: 'POST', url: '/api/releases/:id/verify', owner: 'C', phase: 'Phase 2 (C)' },
  { method: 'POST', url: '/api/releases/:id/deploy', owner: 'C', phase: 'Phase 2 (C)' },
  { method: 'POST', url: '/api/projects/:pid/rollback', owner: 'C', phase: 'Phase 2 (C)' },
  { method: 'GET', url: '/api/projects/:pid/deployments', owner: 'C', phase: 'Phase 2 (C)' },
  { method: 'POST', url: '/api/projects/:pid/verifications', owner: 'C', phase: 'Phase 2 (C)' },
  { method: 'GET', url: '/api/verifications/:id', owner: 'C', phase: 'Phase 2 (C)' },
  { method: 'GET', url: '/api/artifacts/:file', owner: 'C', phase: 'Phase 2 (C)' },
  { method: 'POST', url: '/api/projects/:pid/drift/check', owner: 'B', phase: 'Phase 2 (B)' },
  { method: 'GET', url: '/api/projects/:pid/drift', owner: 'B', phase: 'Phase 2 (B)' },
  { method: 'POST', url: '/api/drift/:id/quarantine', owner: 'B', phase: 'Phase 2 (B)' },
  { method: 'GET', url: '/api/bench', owner: 'B', phase: 'Phase 2 (B)' },
];

export function buildControlApp(opts: AppOptions): FastifyInstance {
  const { registry, db } = opts;
  const app = Fastify({ logger: opts.logger ?? false });

  // Request id on every response (PLAN 11.11: ApiError carries requestId).
  app.addHook('onRequest', async (req, reply) => {
    reply.header('x-request-id', req.id);
  });

  // Global error handler: AppError and zod errors become ApiError JSON (PLAN 11.11).
  app.setErrorHandler((err, req: FastifyRequest, reply: FastifyReply) => {
    const requestId = String(req.id);
    if (isAppError(err)) {
      return reply.status(err.httpStatus).send(err.toApiError(requestId));
    }
    if (err instanceof ZodError) {
      const appErr = new AppError('VALIDATION_FAILED', 'Request failed validation', err.issues);
      return reply.status(appErr.httpStatus).send(appErr.toApiError(requestId));
    }
    req.log.error(err);
    const internal = new AppError('INTERNAL', 'Internal server error');
    return reply.status(500).send(internal.toApiError(requestId));
  });

  app.setNotFoundHandler((req, reply) => {
    const notFound = new AppError('NOT_FOUND', `No route for ${req.method} ${req.url}`);
    reply.status(404).send(notFound.toApiError(String(req.id)));
  });

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

  // --- A-owned routes that already work at scaffold -------------------------
  app.get('/api/users', async () => {
    const rows = db.prepare('SELECT id, name, role FROM users ORDER BY id').all() as Array<{
      id: string;
      name: string;
      role: string;
    }>;
    return { items: rows };
  });

  app.get('/api/projects', async () => {
    const rows = db
      .prepare('SELECT id, name, upstream_origin, paths_json, live_release_id, created_at FROM projects ORDER BY id')
      .all() as Array<{
      id: string;
      name: string;
      upstream_origin: string;
      paths_json: string;
      live_release_id: string | null;
      created_at: string;
    }>;
    return {
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        upstreamOrigin: r.upstream_origin,
        paths: JSON.parse(r.paths_json) as string[],
        liveReleaseId: r.live_release_id,
        createdAt: r.created_at,
      })),
    };
  });

  app.get('/api/projects/:pid', async (req) => {
    const { pid } = req.params as { pid: string };
    const r = db
      .prepare(
        'SELECT id, name, upstream_origin, paths_json, live_release_id, created_at FROM projects WHERE id = ?',
      )
      .get(pid) as
      | {
          id: string;
          name: string;
          upstream_origin: string;
          paths_json: string;
          live_release_id: string | null;
          created_at: string;
        }
      | undefined;
    if (!r) throw new AppError('NOT_FOUND', `No project ${pid}`);
    return {
      id: r.id,
      name: r.name,
      upstreamOrigin: r.upstream_origin,
      paths: JSON.parse(r.paths_json) as string[],
      liveReleaseId: r.live_release_id,
      createdAt: r.created_at,
    };
  });

  // --- stub routes (501, ApiError shape) ------------------------------------
  for (const route of STUB_ROUTES) {
    app.route({
      method: route.method,
      url: route.url,
      handler: () => {
        throw new AppError(
          'NOT_IMPLEMENTED',
          `${route.method} ${route.url} arrives in ${route.phase} (owner: Dev ${route.owner})`,
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
