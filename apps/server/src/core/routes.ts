// apps/server/src/core/routes.ts (owner: Dev A)
// The A-owned control-plane routes (PLAN 11.12). Scaffold: users/projects. Step 11:
// audit reads. Step 12: patches CRUD, validate, submit, reviews. Step 13: the merge
// gate and the conflict check. Step 14: previews. No A-owned 501 stubs remain.
import type { FastifyInstance } from 'fastify';
import { AppError, USER_HEADER } from '@patchwork/shared';
import type {
  AuditType,
  ConflictResolutionChoice,
  PatchStatus,
  PreviewSpec,
  ServiceRegistry,
} from '@patchwork/shared';
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
import { checkConflicts, mergePatch, type MergeEngine } from './merge.js';
import { previewUrl, updatePreviewRow } from './previews.js';
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
  opts: { registry: ServiceRegistry; db: Db; engine?: MergeEngine; previewOrigin?: string },
): void {
  const { registry, db, engine, previewOrigin = 'http://localhost:4300' } = opts;

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

  // --- merge gate (step 13) ---------------------------------------------------------
  app.post('/api/patches/:id/merge', async (req) => {
    const { id } = req.params as { id: string };
    const actor = requireUser(db, req.headers[USER_HEADER] as string | undefined);
    const body = (req.body ?? {}) as {
      choices?: ConflictResolutionChoice[];
      expectedRevision?: number;
    };
    return mergePatch(
      db,
      registry.audit,
      registry,
      id,
      { choices: body.choices, expectedRevision: body.expectedRevision },
      actor.id,
      engine,
    );
  });

  app.post('/api/projects/:pid/conflicts', async (req) => {
    const { pid } = req.params as { pid: string };
    if (!registry.core.getProject(pid)) {
      throw new AppError('NOT_FOUND', `No project ${pid}`);
    }
    const { candidateIds } = (req.body ?? {}) as { candidateIds?: string[] };
    const candidates = (candidateIds ?? []).map((cid) => getPatchOrThrow(db, cid));
    return checkConflicts(registry, pid, candidates, engine);
  });

  // --- previews (step 14) -----------------------------------------------------------
  app.post('/api/projects/:pid/previews', async (req) => {
    const { pid } = req.params as { pid: string };
    const actor = requireUser(db, req.headers[USER_HEADER] as string | undefined);
    const spec = (req.body ?? {}) as PreviewSpec;
    const preview = registry.core.createPreview(pid, spec, actor.id);
    const firstPath = registry.core.getProject(pid)?.paths[0] ?? '/';
    return { preview, url: previewUrl(preview.id, firstPath, previewOrigin) };
  });

  app.put('/api/previews/:id', async (req) => {
    const { id } = req.params as { id: string };
    const actor = requireUser(db, req.headers[USER_HEADER] as string | undefined);
    const existing = registry.core.getPreview(id);
    if (!existing) throw new AppError('NOT_FOUND', `No preview ${id}`);
    const preview = updatePreviewRow(db, registry, id, req.body as PreviewSpec, actor.id);
    const firstPath = registry.core.getProject(existing.projectId)?.paths[0] ?? '/';
    return { preview, url: previewUrl(preview.id, firstPath, previewOrigin) };
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
