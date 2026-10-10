// apps/server/src/core/routes.ts (owner: Dev A)
// A-owned control routes (PLAN 11.12): patches, reviews, merge gate, conflicts, previews, audit.
// Every state change appends exactly one audit event (merge also records conflict events).
import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  AppError,
  conflictsRequestSchema,
  createPatchRequestSchema,
  mergeRequestSchema,
  previewSpecSchema,
  reviewRequestSchema,
  updatePatchRequestSchema,
  USER_HEADER,
} from '@patchwork/shared';
import type {
  AuditType,
  ConflictReport,
  ConflictResolutionChoice,
  FrozenPatch,
  Id,
  Patch,
  PatchBody,
  PatchStatus,
  Preview,
  PreviewSpec,
  Review,
  Role,
  ServiceRegistry,
} from '@patchwork/shared';
import { analyzeConflicts } from '@patchwork/engine';
import { documentFromHtml } from '@patchwork/engine/node';
import type { Db } from '../db/sqlite.js';
import { loadEnv, type Env } from '../env.js';
import { newId, type CoreServiceExt } from './index.js';
import { pickBody } from './repo.js';
import { getActiveProjectId, setActiveProjectId } from '../active.js';
import { validatePatchBody } from './validate.js';

const PATCH_STATUSES: PatchStatus[] = ['draft', 'in_review', 'changes_requested', 'approved', 'merged', 'rejected'];
/** Choices that can unblock a merge here; 'edit_patch' / 'withdraw_candidate_op' mean editing the patch first. */
const MERGE_CHOICES = new Set<ConflictResolutionChoice['choice']>(['candidate_overrides', 'reorder']);

/** PatchBody.urlPath is an exact path or a trailing-* prefix glob such as '/products/*'. */
export function pathMatches(pattern: string, path: string): boolean {
  if (pattern === path) return true;
  if (pattern.endsWith('/*')) return path.startsWith(pattern.slice(0, -1));
  return false;
}

export function registerCoreRoutes(
  app: FastifyInstance,
  registry: ServiceRegistry,
  db: Db,
  env: Env = loadEnv(),
): void {
  const core = registry.core as CoreServiceExt;
  const { repo } = core;

  const actor = (req: FastifyRequest, ...roles: Role[]): { id: Id; role: Role } => {
    const header = req.headers[USER_HEADER];
    const id = typeof header === 'string' ? header : '';
    const row = db.prepare('SELECT role FROM users WHERE id = ?').get(id) as { role: Role } | undefined;
    if (!row) throw new AppError('FORBIDDEN', `Send ${USER_HEADER} with a known user id`);
    if (roles.length > 0 && !roles.includes(row.role)) {
      throw new AppError('FORBIDDEN', `${id} is a ${row.role}; this needs ${roles.join(' or ')}`);
    }
    return { id, role: row.role };
  };

  const requireProject = (pid: string) => {
    const project = core.getProject(pid);
    if (!project) throw new AppError('NOT_FOUND', `No project ${pid}`);
    return project;
  };

  const requirePatch = (id: string): Patch => {
    const patch = core.getPatch(id);
    if (!patch) throw new AppError('NOT_FOUND', `No patch ${id}`);
    return patch;
  };

  /** Full PLAN 11.4 validation; returns the (possibly sanitised) body or throws 400 with the issues. */
  const validBody = (body: PatchBody): PatchBody => {
    const result = validatePatchBody(body);
    if (!result.valid) throw new AppError('VALIDATION_FAILED', 'Patch failed validation', result.issues);
    return result.sanitized ?? body;
  };

  const audit = (patch: Patch, type: AuditType, actorId: Id, data: Record<string, unknown>): void => {
    registry.audit.append({ projectId: patch.projectId, type, actorId, subject: { type: 'patch', id: patch.id }, data });
  };

  const transition = (patch: Patch, allowed: PatchStatus[], to: PatchStatus, action: string): Patch => {
    if (!allowed.includes(patch.status)) {
      throw new AppError('INVALID_STATE', `Cannot ${action} a ${patch.status} patch (needs ${allowed.join(' | ')})`);
    }
    const next: Patch = { ...patch, status: to, updatedAt: new Date().toISOString() };
    repo.updatePatch(next);
    return next;
  };

  const inTransaction = <T>(fn: () => T): T => {
    db.exec('BEGIN');
    try {
      const out = fn();
      db.exec('COMMIT');
      return out;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };

  const frozen = (p: Patch): FrozenPatch => ({ ...pickBody(p), patchId: p.id, revision: p.revision, title: p.title });

  /** Concrete page for a urlPath: itself, or the first tracked project path a glob matches. */
  const pagePathFor = (projectPaths: string[], urlPath: string): string => {
    if (!urlPath.endsWith('/*')) return urlPath;
    return projectPaths.find((p) => pathMatches(urlPath, p)) ?? urlPath.slice(0, -1);
  };

  /** analyzeConflicts on the latest snapshot of the candidates' page (PLAN 13.3 step 13). */
  const conflictReport = async (projectId: Id, candidates: FrozenPatch[]): Promise<ConflictReport> => {
    const project = requireProject(projectId);
    const first = candidates[0];
    if (!first) throw new AppError('VALIDATION_FAILED', 'At least one candidate patch is required');
    const path = pagePathFor(project.paths, first.urlPath);
    const candidateIds = new Set(candidates.map((c) => c.patchId));
    const head = core
      .listHead(projectId)
      .filter((p) => !candidateIds.has(p.patchId) && pathMatches(p.urlPath, path));
    const snapshot = registry.snapshots.latest(projectId, path) ?? (await registry.snapshots.capture(projectId, path));
    const { document } = documentFromHtml(snapshot.html, `${project.upstreamOrigin}${path}`);
    const result = analyzeConflicts(document, head, candidates);
    return { projectId, snapshotId: snapshot.id, checkedAt: new Date().toISOString(), ...result };
  };

  const previewUrl = (preview: Preview): string => {
    const project = requireProject(preview.projectId);
    const { spec } = preview;
    const included = spec.include.map((id) => core.getPatch(id)).find((p) => p !== null);
    const wanted = spec.draft?.urlPath ?? included?.urlPath ?? null;
    const path = wanted ? pagePathFor(project.paths, wanted) : (project.paths[0] ?? '/');
    return `${env.PW_PREVIEW_ORIGIN}/__patchwork/preview/${preview.id}?path=${encodeURIComponent(path)}`;
  };

  /** Validates the draft (sanitising insertHTML) and that included/excluded patches exist. */
  const checkedSpec = (projectId: Id, raw: unknown): PreviewSpec => {
    const spec = previewSpecSchema.parse(raw) as PreviewSpec;
    for (const id of [...spec.include, ...spec.exclude]) {
      const p = core.getPatch(id);
      if (!p || p.projectId !== projectId) throw new AppError('NOT_FOUND', `No patch ${id} in ${projectId}`);
    }
    if (spec.draft) {
      const { title, ...body } = spec.draft;
      spec.draft = { ...validBody(pickBody(body)), title };
    }
    return spec;
  };

  // --- patches ----------------------------------------------------------------

  app.get('/api/projects/:pid/patches', async (req) => {
    const { pid } = req.params as { pid: string };
    const { status } = req.query as { status?: string };
    requireProject(pid);
    if (status !== undefined && !PATCH_STATUSES.includes(status as PatchStatus)) {
      throw new AppError('VALIDATION_FAILED', `Unknown status "${status}"`);
    }
    return { items: repo.listPatches(pid, status as PatchStatus | undefined) };
  });

  app.post('/api/projects/:pid/patches', async (req) => {
    const { pid } = req.params as { pid: string };
    requireProject(pid);
    const user = actor(req);
    const input = createPatchRequestSchema.parse(req.body ?? {});
    const body = validBody(pickBody(input as PatchBody));
    const now = new Date().toISOString();
    const patch: Patch = {
      ...body,
      id: newId('pat'),
      projectId: pid,
      title: input.title,
      description: input.description,
      authorId: user.id,
      status: 'draft',
      revision: 1,
      mergedRevision: null,
      createdAt: now,
      updatedAt: now,
    };
    inTransaction(() => {
      repo.insertPatch(patch);
      repo.insertRevision(patch.id, 1, patch.title, body, user.id);
    });
    audit(patch, 'patch.created', user.id, { revision: 1, title: patch.title, urlPath: patch.urlPath, ops: patch.ops.length });
    return patch;
  });

  app.get('/api/patches/:id', async (req) => requirePatch((req.params as { id: string }).id));

  app.put('/api/patches/:id', async (req) => {
    const patch = requirePatch((req.params as { id: string }).id);
    const user = actor(req);
    const input = updatePatchRequestSchema.parse(req.body ?? {});
    if (input.expectedRevision !== patch.revision) {
      throw new AppError('STALE_REVISION', `Patch is at revision ${patch.revision}, not ${input.expectedRevision}`, {
        currentRevision: patch.revision,
      });
    }
    if (patch.status === 'rejected') throw new AppError('INVALID_STATE', 'A rejected patch cannot be edited');
    const { expectedRevision: _rev, title, description, ...partial } = input;
    const body = validBody(pickBody({ ...pickBody(patch), ...stripUndefined(partial) } as PatchBody));
    const next: Patch = {
      ...patch,
      ...body,
      title: title ?? patch.title,
      description: description ?? patch.description,
      // Any edit goes back to draft; a merged patch keeps mergedRevision in head until re-merged.
      status: 'draft',
      revision: patch.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    inTransaction(() => {
      repo.insertRevision(next.id, next.revision, next.title, body, user.id);
      repo.updatePatch(next);
    });
    audit(next, 'patch.updated', user.id, { revision: next.revision, previousStatus: patch.status });
    return next;
  });

  app.post('/api/patches/:id/validate', async (req) => {
    const patch = requirePatch((req.params as { id: string }).id);
    return validatePatchBody(pickBody(patch));
  });

  app.post('/api/patches/:id/submit', async (req) => {
    const patch = requirePatch((req.params as { id: string }).id);
    const user = actor(req);
    validBody(pickBody(patch));
    const next = transition(patch, ['draft', 'changes_requested'], 'in_review', 'submit');
    audit(next, 'patch.submitted', user.id, { revision: next.revision });
    return next;
  });

  app.post('/api/patches/:id/reviews', async (req) => {
    const patch = requirePatch((req.params as { id: string }).id);
    const user = actor(req, 'reviewer', 'release_manager');
    if (patch.authorId === user.id) throw new AppError('FORBIDDEN', 'Authors cannot review their own patch');
    const { decision, comment } = reviewRequestSchema.parse(req.body ?? {});
    const review: Review = {
      id: newId('rev'),
      patchId: patch.id,
      revision: patch.revision,
      reviewerId: user.id,
      decision,
      comment,
      createdAt: new Date().toISOString(),
    };
    inTransaction(() => {
      if (decision === 'approve') transition(patch, ['in_review', 'changes_requested'], 'approved', 'approve');
      if (decision === 'request_changes') {
        transition(patch, ['in_review', 'approved'], 'changes_requested', 'request changes on');
      }
      if (decision === 'comment' && !['in_review', 'approved', 'changes_requested'].includes(patch.status)) {
        throw new AppError('INVALID_STATE', `Cannot review a ${patch.status} patch`);
      }
      db.prepare(
        `INSERT INTO reviews (id, patch_id, revision, reviewer_id, decision, comment, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(review.id, review.patchId, review.revision, review.reviewerId, decision, comment, review.createdAt);
    });
    audit(patch, 'patch.reviewed', user.id, { reviewId: review.id, revision: review.revision, decision, comment });
    return review;
  });

  app.get('/api/patches/:id/reviews', async (req) => {
    const patch = requirePatch((req.params as { id: string }).id);
    const rows = db
      .prepare('SELECT * FROM reviews WHERE patch_id = ? ORDER BY created_at DESC')
      .all(patch.id) as Array<Record<string, string | number>>;
    return {
      items: rows.map((r) => ({
        id: r.id,
        patchId: r.patch_id,
        revision: r.revision,
        reviewerId: r.reviewer_id,
        decision: r.decision,
        comment: r.comment,
        createdAt: r.created_at,
      })),
    };
  });

  // --- merge gate ---------------------------------------------------------------

  app.post('/api/patches/:id/merge', async (req) => {
    const patch = requirePatch((req.params as { id: string }).id);
    const user = actor(req, 'reviewer', 'release_manager');
    if (patch.authorId === user.id) throw new AppError('FORBIDDEN', 'Authors cannot merge their own patch');
    if (patch.status !== 'approved') {
      throw new AppError('INVALID_STATE', `Only approved patches merge; this one is ${patch.status}`);
    }
    const { choices } = mergeRequestSchema.parse(req.body ?? { choices: [] });
    const report = await conflictReport(patch.projectId, [frozen(patch)]);

    const byId = new Map(report.conflicts.map((c) => [c.id, c]));
    for (const choice of choices) {
      const conflict = byId.get(choice.conflictId);
      if (!conflict) throw new AppError('VALIDATION_FAILED', `Unknown conflict ${choice.conflictId}`, report);
      if (!conflict.resolutions.includes(choice.choice) || !MERGE_CHOICES.has(choice.choice)) {
        throw new AppError(
          'VALIDATION_FAILED',
          `"${choice.choice}" cannot resolve ${conflict.type} at merge time; edit the patch instead`,
          report,
        );
      }
    }
    const chosen = new Map(choices.map((c) => [c.conflictId, c]));
    const unresolved = report.conflicts.filter((c) => c.severity === 'blocking' && !chosen.has(c.id));

    if (report.conflicts.length > 0) {
      audit(patch, 'conflict.detected', user.id, {
        revision: patch.revision,
        snapshotId: report.snapshotId,
        conflicts: report.conflicts.map((c) => ({ id: c.id, type: c.type, severity: c.severity, patchIds: c.patchIds })),
        blocking: unresolved.length > 0,
      });
    }
    if (unresolved.length > 0) {
      throw new AppError(
        'MERGE_BLOCKED',
        `${unresolved.length} blocking conflict(s): ${unresolved.map((c) => c.type).join(', ')}`,
        report,
      );
    }

    const merged = inTransaction(() => {
      let order = repo.mergeOrderOf(patch.id) ?? repo.maxMergeOrder(patch.projectId) + 1;
      // candidate_overrides / reorder: the candidate goes after every patch it overrides, so its value wins.
      const overridden = choices
        .flatMap((c) => byId.get(c.conflictId)?.patchIds.slice(1) ?? [])
        .map((id) => repo.mergeOrderOf(id))
        .filter((o): o is number => o !== null);
      const after = overridden.length > 0 ? Math.max(...overridden) : 0;
      if (order <= after) {
        repo.shiftMergeOrder(patch.projectId, after + 1);
        order = after + 1;
      }
      repo.setMerged(patch.id, patch.revision, order);
      return transition({ ...patch, mergedRevision: patch.revision }, ['approved'], 'merged', 'merge');
    });

    for (const choice of choices) {
      audit(merged, 'conflict.resolved', user.id, { conflictId: choice.conflictId, choice: choice.choice, note: choice.note });
    }
    audit(merged, 'patch.merged', user.id, {
      revision: merged.revision,
      snapshotId: report.snapshotId,
      conflicts: report.conflicts.length,
    });
    return { patch: merged, report };
  });

  app.post('/api/projects/:pid/conflicts', async (req) => {
    const { pid } = req.params as { pid: string };
    requireProject(pid);
    const { candidateIds } = conflictsRequestSchema.parse(req.body ?? {});
    const candidates = candidateIds.map((id) => {
      const p = requirePatch(id);
      if (p.projectId !== pid) throw new AppError('NOT_FOUND', `No patch ${id} in ${pid}`);
      return frozen(p);
    });
    return conflictReport(pid, candidates);
  });

  // --- previews -----------------------------------------------------------------

  app.post('/api/projects/:pid/previews', async (req) => {
    const { pid } = req.params as { pid: string };
    requireProject(pid);
    const user = actor(req);
    const preview = core.createPreview(pid, checkedSpec(pid, req.body), user.id);
    return { preview, url: previewUrl(preview) };
  });

  app.put('/api/previews/:id', async (req) => {
    const { id } = req.params as { id: string };
    actor(req);
    const existing = core.getPreview(id);
    if (!existing) throw new AppError('NOT_FOUND', `No preview ${id}`);
    const preview = core.updatePreview(id, checkedSpec(existing.projectId, req.body));
    return { preview, url: previewUrl(preview) };
  });

  app.get('/api/previews/:id', async (req) => {
    const preview = core.getPreview((req.params as { id: string }).id);
    if (!preview) throw new AppError('NOT_FOUND', 'No such preview');
    return { preview, url: previewUrl(preview) };
  });

  // --- connected sites ------------------------------------------------------------

  /** http(s)://host[:port] only: no path, query, fragment or credentials. Returns the normalised origin. */
  const checkOrigin = (raw: string): string => {
    let url: URL;
    try {
      url = new URL(raw.trim());
    } catch {
      throw new AppError('VALIDATION_FAILED', `“${raw}” is not a web address. Use http://localhost:3000 or https://example.com.`);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new AppError('VALIDATION_FAILED', 'The address must start with http:// or https://.');
    }
    if (url.username || url.password) throw new AppError('VALIDATION_FAILED', 'The address must not contain a user name or password.');
    if ((url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) {
      throw new AppError('VALIDATION_FAILED', 'Use only the site address, without a path, e.g. http://localhost:3000. Add pages below.');
    }
    return url.origin;
  };

  app.post('/api/projects', async (req) => {
    actor(req, 'release_manager');
    const body = (req.body ?? {}) as { name?: unknown; upstreamOrigin?: unknown; paths?: unknown };
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name === '' || name.length > 60) throw new AppError('VALIDATION_FAILED', 'Give the site a name (up to 60 characters).');
    if (typeof body.upstreamOrigin !== 'string') throw new AppError('VALIDATION_FAILED', 'Enter the site address.');
    const origin = checkOrigin(body.upstreamOrigin);
    const rawPaths = Array.isArray(body.paths) && body.paths.length > 0 ? body.paths : ['/'];
    const paths = [...new Set(rawPaths.map((p) => String(p).trim()).filter(Boolean))].slice(0, 10);
    for (const p of paths) {
      if (!p.startsWith('/') || p.startsWith('//') || p.includes('?') || p.includes('#')) {
        throw new AppError('VALIDATION_FAILED', `Pages must look like / or /cart, not “${p}”.`);
      }
    }
    if (repo.listProjects().some((p) => p.upstreamOrigin === origin)) {
      throw new AppError('INVALID_STATE', `${origin} is already connected.`);
    }
    // the site must answer now, otherwise the Studio would show an error page
    try {
      await fetch(origin + paths[0], { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(5000) });
    } catch {
      throw new AppError('UPSTREAM_UNREACHABLE', `Could not reach ${origin}. Is the site running?`);
    }
    const project = {
      id: newId('prj'),
      name,
      upstreamOrigin: origin,
      paths,
      liveReleaseId: null,
      createdAt: new Date().toISOString(),
    };
    repo.insertProject(project);
    return project;
  });

  /** Whether the site's own server lets browsers show it in a frame (the Studio's Original tab). */
  app.get('/api/projects/:pid/framing', async (req) => {
    const project = requireProject((req.params as { pid: string }).pid);
    try {
      const res = await fetch(project.upstreamOrigin + (project.paths[0] ?? '/'), {
        redirect: 'manual',
        signal: AbortSignal.timeout(4000),
      });
      const xfo = res.headers.get('x-frame-options');
      const csp = res.headers.get('content-security-policy') ?? '';
      const blocked = (xfo !== null && xfo.trim() !== '') || /frame-ancestors\s+(?!\*)/i.test(csp);
      return { framable: !blocked };
    } catch {
      return { framable: false };
    }
  });

  app.get('/api/active-project', async () => {
    const id = getActiveProjectId();
    const project = core.getProject(id);
    if (!project) throw new AppError('NOT_FOUND', `The active site ${id} does not exist. Run ./demo.sh to seed it.`);
    return project;
  });

  app.put('/api/active-project', async (req) => {
    actor(req);
    const { projectId } = (req.body ?? {}) as { projectId?: unknown };
    if (typeof projectId !== 'string' || !core.getProject(projectId)) throw new AppError('NOT_FOUND', 'No such site.');
    setActiveProjectId(projectId);
    return core.getProject(projectId);
  });

  // --- audit --------------------------------------------------------------------

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

function stripUndefined<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}
