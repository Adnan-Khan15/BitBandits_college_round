// OWNER: Dev B - replace this stub (docs/PLAN.md sections 6, 11.9, 13.4).
// Drift Sentinel: poll snapshots, compute DriftReport, propose heals and quarantine release,
// serve bench results.
import type { FastifyInstance } from 'fastify';
import type { DriftService, ServiceRegistry } from '@patchwork/shared';
import { AppError } from '@patchwork/shared';

const notImplemented = (fn: string): never => {
  throw new AppError('NOT_IMPLEMENTED', `drift.${fn} is a scaffold stub (owner: Dev B)`);
};

export function createDriftService(): DriftService {
  return {
    check: () => notImplemented('check'),
    list: () => notImplemented('list'),
    proposeQuarantine: () => notImplemented('proposeQuarantine'),
    bench: () => notImplemented('bench'),
  };
}

export function registerDriftRoutes(_app: FastifyInstance, _registry: ServiceRegistry): void {
  // POST /api/projects/:pid/drift/check, GET /api/projects/:pid/drift,
  // POST /api/drift/:id/quarantine, GET /api/bench -> 501.
}
