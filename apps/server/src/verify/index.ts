// OWNER: Dev C - replace this stub (docs/PLAN.md sections 11.7, 13.5).
// Verify: baseline vs candidate runs, checks, console diff, masked pixel diff, artifacts.
import type { FastifyInstance } from 'fastify';
import type { ServiceRegistry, VerificationRun, VerifyService } from '@patchwork/shared';
import { AppError } from '@patchwork/shared';

const notImplemented = (fn: string): never => {
  throw new AppError('NOT_IMPLEMENTED', `verify.${fn} is a scaffold stub (owner: Dev C)`);
};

export function createVerifyService(): VerifyService {
  return {
    start: () => notImplemented('start'),
    runToCompletion: () => notImplemented('runToCompletion'),
    get: (_id: string): VerificationRun | null => notImplemented('get'),
  };
}

export function registerVerifyRoutes(_app: FastifyInstance, _registry: ServiceRegistry): void {
  // POST /api/projects/:pid/verifications, GET /api/verifications/:id, GET /api/artifacts/:file -> 501.
}
