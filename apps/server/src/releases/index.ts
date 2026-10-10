// OWNER: Dev C - replace this stub (docs/PLAN.md sections 11.8, 13.5).
// Releases: freeze head, verify gate, deploy (one pointer move), health, rollback, beacons.
import type { FastifyInstance } from 'fastify';
import type { ReleaseService, ServiceRegistry } from '@patchwork/shared';
import { AppError } from '@patchwork/shared';
import type { Db } from '../db/sqlite.js';

const notImplemented = (fn: string): never => {
  throw new AppError('NOT_IMPLEMENTED', `releases.${fn} is a scaffold stub (owner: Dev C)`);
};

// NOTE (Dev A, scaffold-only wiring): `db` param added per Dev C's registry dependency
// request so registry.releases = createReleaseService(db) typechecks. Dev C replaces
// the stub body with the real implementation (his signature may widen to (db, registry, env)).
export function createReleaseService(_db: Db): ReleaseService {
  return {
    create: () => notImplemented('create'),
    get: () => notImplemented('get'),
    list: () => notImplemented('list'),
    live: () => notImplemented('live'),
    manifestForLive: () => notImplemented('manifestForLive'),
    deploy: () => notImplemented('deploy'),
    rollback: () => notImplemented('rollback'),
    recordBeacon: () => notImplemented('recordBeacon'),
  };
}

export function registerReleaseRoutes(_app: FastifyInstance, _registry: ServiceRegistry): void {
  // GET|POST /api/projects/:pid/releases, POST /api/releases/:id/{verify,deploy},
  // POST /api/projects/:pid/rollback, GET /api/projects/:pid/deployments -> 501.
}
