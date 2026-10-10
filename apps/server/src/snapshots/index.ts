// OWNER: Dev C - replace this stub (docs/PLAN.md sections 11.7, 13.5).
// Snapshots: Playwright capture of upstream pages -> snapshots table.
import type { FastifyInstance } from 'fastify';
import type { ServiceRegistry, SnapshotService } from '@patchwork/shared';
import { AppError } from '@patchwork/shared';

const notImplemented = (fn: string): never => {
  throw new AppError('NOT_IMPLEMENTED', `snapshots.${fn} is a scaffold stub (owner: Dev C)`);
};

export function createSnapshotService(): SnapshotService {
  return {
    capture: () => notImplemented('capture'),
    latest: () => notImplemented('latest'),
    get: () => notImplemented('get'),
  };
}

export function registerSnapshotRoutes(_app: FastifyInstance, _registry: ServiceRegistry): void {
  // POST /api/projects/:pid/snapshots -> 501 until Dev C lands it.
}
