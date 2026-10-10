// apps/server/src/core/routes.ts (owner: Dev A)
// Phase 2 step 12: the A-owned control-plane routes (PLAN 11.12).
// Users/projects moved here from app.ts at scaffold time; patches CRUD, validate,
// submit, reviews and the audit read routes land in this step. Merge (13),
// conflicts (13) and previews (14) stay as 501 stubs in app.ts until their steps.
import type { FastifyInstance } from 'fastify';
import { AppError, USER_HEADER } from '@patchwork/shared';
import type { AuditType, PatchStatus, ServiceRegistry } from '@patchwork/shared';
import type { Db } from '../db/sqlite.js';
import {
  addReview,
  bodyOf,
  createPatch,
  getPatchOrThrow,
  listPatches,
  requireUser,
  submitPatch,
  updatePatch,
} from './patches.js';
import { validatePatchBody } from './validate.js';

const STATUSES: PatchStatus[] = [
  'draft',
  'in_review',
  'changes_requested',
  'approved',
  'merged',
  'rejected',
];

export function registerCoreRoutes(
  app: FastifyInstance,
  opts: { registry: ServiceRegistry; db: Db },
): void {
  const { registry, db } = opts;

  // --- users & projects (real since scaffold) ---------------------------------
  app.get('/api/users', async () => {
    const rows = db
      .prepare('SELECT id, name, role FROM users ORDER BY id')
      .all() as Array<{ id: string; name: string; role: string }>;
    return { items: rows };
  });

  app.get('/api/projects', async () => {
    const rows = db
      .prepare('SELECT * FROM projects ORDER BY id')
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
    const project = registry.core.getProject(pid);
    if (!project) throw new AppError('NOT_FOUND', `No project ${pid}`);
    return project;
  });

  // --- patches -------------------------------------------------------------------
  app.get('/api/projects/:pid/patches', async (req) => {
    const { pid } = req.params as { pid: string };
    const { status } = req.query as { status?: string };
    if (status !== undefined && !STATUSES.includes(status as PatchStatus)) {
      throw new AppError('VALIDATION_FAILED', `Unknown patch status "${status}"`, {
        allowed: STATUSES,
      });
    }
    return { items: listPatches(db, pid, status) };
  });

  app.post('/api/projects/:pid/patches', async (req) => {
    const { pid } = req.params as { pid: string };
    const actor = requireUser(db, req.headers[USER_HEADER] as string | undefined);
    if (!registry.core.getProject(pid)) {
      throw new AppError('NOT_FOUND', `No project ${pid}`);
    }
    return createPatch(db, registry.audit, pid, req.body as Parameters<typeof createPatch>[3], actor.id);
  });

  app.get('/api/patches/:id', async (req) => {
    const { id } = req.params as { id: string };
    return getPatchOrThrow(db, id);
  });

  app.put('/api/patches/:id', async (req) => {
    const { id } = req.params as { id: string };
    const actor = requireUser(db, req.headers[USER_HEADER] as string | undefined);
    return updatePatch(db, registry.audit, id, req.body as Parameters<typeof updatePatch>[3], actor.id);
  });

  app.post('/api/patches/:id/validate', async (req) => {
    const { id } = req.params as { id: string };
    const patch = getPatchOrThrow(db, id);
    return validatePatchBody(bodyOf(patch));
  });

  app.post('/api/patches/:id/submit', async (req) => {
    const { id } = req.params as { id: string };
    const actor = requireUser(db, req.headers[USER_HEADER] as string | undefined);
    return submitPatch(db, registry.audit, id, actor.id);
  });

  app.post('/api/patches/:id/reviews', async (req) => {
    const { id } = req.params as { id: string };
    const reviewer = requireUser(db, req.headers[USER_HEADER] as string | undefined);
    const { decision, comment } = req.body as {
      decision: 'approve' | 'request_changes' | 'comment';
      comment: string;
    };
    return addReview(db, registry.audit, id, decision, comment ?? '', reviewer.id);
  });

  // --- audit (service landed in step 11) -------------------------------------------
  app.get('/api/projects/:pid/audit', async (req) => {
    const { pid } = req.params as { pid: string };
    const { type, limit } = req.query as { type?: string; limit?: string };
    const items = registry.audit.list(pid, {
      type: type as AuditType | undefined,
      limit: limit !== undefined ? Number.parseInt(limit, 10) : undefined,
    });
    return { items };
  });

  app.get('/api/projects/:pid/audit/verify', async (req) => {
    const { pid } = req.params as { pid: string };
    return registry.audit.verifyChain(pid);
  });
}
