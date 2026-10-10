// apps/server/src/core/routes.ts (owner: Dev A)
// A-owned control routes (PLAN 11.12): audit now; patches, reviews, merge, conflicts, previews in Phase 2.
import type { FastifyInstance } from 'fastify';
import { AppError } from '@patchwork/shared';
import type { AuditType, ServiceRegistry } from '@patchwork/shared';

export function registerCoreRoutes(app: FastifyInstance, registry: ServiceRegistry): void {
  const requireProject = (pid: string): void => {
    if (!registry.core.getProject(pid)) throw new AppError('NOT_FOUND', `No project ${pid}`);
  };

  app.get('/api/projects/:pid/audit', async (req) => {
    const { pid } = req.params as { pid: string };
    const q = req.query as { type?: string; limit?: string };
    requireProject(pid);
    const limit = q.limit !== undefined ? Number.parseInt(q.limit, 10) : undefined;
    return {
      items: registry.audit.list(pid, {
        type: q.type ? (q.type as AuditType) : undefined,
        limit: limit !== undefined && Number.isFinite(limit) ? limit : undefined,
      }),
    };
  });

  app.get('/api/projects/:pid/audit/verify', async (req) => {
    const { pid } = req.params as { pid: string };
    requireProject(pid);
    return registry.audit.verifyChain(pid);
  });
}
