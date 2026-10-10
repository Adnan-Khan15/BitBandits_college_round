// apps/server/src/core/merge.ts (owner: Dev A)
// Phase 2 step 13 (PLAN 11.5, 11.12, 13.3): the merge gate.
// The candidate patch is analysed against the frozen head on one snapshot document
// (engine.analyzeConflicts). A blocking conflict without a reviewer's matching
// ConflictResolutionChoice stops the merge with 409 MERGE_BLOCKED and the report in
// details; otherwise the patch is appended to head (merge_order) and audited.
//
// The engine is injected (default = the real @patchwork/engine) so tests run with a
// stubbed engine and a stubbed SnapshotService (T-API-MERGE, PLAN 13.3 step 13).
import { analyzeConflicts } from '@patchwork/engine';
import { documentFromHtml } from '@patchwork/engine/node';
import type {
  AuditService,
  ConflictReport,
  ConflictResolutionChoice,
  FrozenPatch,
  Id,
  Patch,
  ServiceRegistry,
  Snapshot,
} from '@patchwork/shared';
import { AppError } from '@patchwork/shared';
import type { Db } from '../db/sqlite.js';
import { bodyOf, getPatchOrThrow, requireReviewer, requireUser } from './patches.js';

export interface MergeEngine {
  documentFromHtml: typeof documentFromHtml;
  analyzeConflicts: typeof analyzeConflicts;
}

export const realMergeEngine: MergeEngine = { documentFromHtml, analyzeConflicts };

/** A stored Patch as the engine's FrozenPatch (head carries merged revisions). */
export function toFrozen(patch: Patch): FrozenPatch {
  return { ...bodyOf(patch), patchId: patch.id, revision: patch.revision, title: patch.title };
}

async function loadSnapshot(registry: ServiceRegistry, projectId: Id, urlPath: string): Promise<Snapshot> {
  const latest = registry.snapshots.latest(projectId, urlPath);
  if (latest) return latest;
  // No snapshot yet (a fresh project): capture one. Dev C's service does the capture.
  return registry.snapshots.capture(projectId, urlPath);
}

/**
 * ConflictReport for the given candidates against head (PLAN 11.5). Both merge and
 * `POST /projects/:pid/conflicts` go through here so they always agree.
 */
export async function checkConflicts(
  registry: ServiceRegistry,
  projectId: Id,
  candidates: Patch[],
  engine: MergeEngine = realMergeEngine,
): Promise<ConflictReport> {
  const first = candidates[0];
  if (!first) {
    throw new AppError('VALIDATION_FAILED', 'At least one candidate patch is required');
  }
  const project = registry.core.getProject(projectId);
  if (!project) throw new AppError('NOT_FOUND', `No project ${projectId}`);
  for (const candidate of candidates) {
    if (candidate.projectId !== projectId) {
      throw new AppError('VALIDATION_FAILED', `Patch ${candidate.id} does not belong to project ${projectId}`, {
        patchId: candidate.id,
      });
    }
  }

  const urlPath = first.urlPath;
  const snapshot = await loadSnapshot(registry, projectId, urlPath);
  const pageUrl = new URL(urlPath, project.upstreamOrigin).toString();
  const { document } = engine.documentFromHtml(snapshot.html, pageUrl);
  const against = registry.core.listHead(projectId);
  const partial = engine.analyzeConflicts(document, against, candidates.map(toFrozen));

  return {
    projectId,
    snapshotId: snapshot.id,
    checkedAt: new Date().toISOString(),
    ...partial,
  };
}

export interface MergeInput {
  choices?: ConflictResolutionChoice[];
  /** Optimistic locking: when sent, must equal the patch revision (PLAN 11.3). */
  expectedRevision?: number;
}

export interface MergeResult {
  patch: Patch;
  report: ConflictReport;
}

export async function mergePatch(
  db: Db,
  audit: AuditService,
  registry: ServiceRegistry,
  patchId: Id,
  input: MergeInput,
  actorId: Id,
  engine: MergeEngine = realMergeEngine,
): Promise<MergeResult> {
  const patch = getPatchOrThrow(db, patchId);
  const actor = requireUser(db, actorId); // 403 unknown/missing user
  requireReviewer(actor, patch); // 403 wrong role, or own patch

  if (patch.status !== 'approved') {
    throw new AppError(
      'INVALID_STATE',
      `Patch ${patchId} is ${patch.status}; only approved patches can be merged`,
      { status: patch.status },
    );
  }
  if (input.expectedRevision !== undefined && patch.revision !== input.expectedRevision) {
    throw new AppError(
      'STALE_REVISION',
      `Patch ${patchId} is at revision ${patch.revision}; reload before merging`,
      { expected: input.expectedRevision, actual: patch.revision },
    );
  }

  const report = await checkConflicts(registry, patch.projectId, [patch], engine);

  // Validate the reviewer's choices against the reported conflicts.
  const choices = input.choices ?? [];
  const byId = new Map(report.conflicts.map((c) => [c.id, c]));
  for (const choice of choices) {
    const conflict = byId.get(choice.conflictId);
    if (!conflict) {
      throw new AppError('VALIDATION_FAILED', `Unknown conflictId ${choice.conflictId}`, {
        conflictId: choice.conflictId,
      });
    }
    if (!conflict.resolutions.includes(choice.choice)) {
      throw new AppError(
        'VALIDATION_FAILED',
        `Resolution ${choice.choice} is not allowed for conflict ${conflict.id}`,
        { conflictId: conflict.id, allowed: conflict.resolutions },
      );
    }
  }

  if (report.conflicts.length > 0) {
    audit.append({
      projectId: patch.projectId,
      type: 'conflict.detected',
      actorId,
      subject: { type: 'patch', id: patchId },
      data: {
        snapshotId: report.snapshotId,
        conflicts: report.conflicts.map((c) => ({ id: c.id, type: c.type, severity: c.severity })),
        blocking: report.blocking,
      },
    });
  }

  const chosenIds = new Set(choices.map((c) => c.conflictId));
  const unresolved = report.conflicts.filter((c) => c.severity === 'blocking' && !chosenIds.has(c.id));
  if (unresolved.length > 0) {
    throw new AppError(
      'MERGE_BLOCKED',
      `Patch ${patchId} has ${unresolved.length} unresolved blocking conflict(s)`,
      { report, conflicts: unresolved },
    );
  }

  for (const choice of choices) {
    audit.append({
      projectId: patch.projectId,
      type: 'conflict.resolved',
      actorId,
      subject: { type: 'patch', id: patchId },
      data: { conflictId: choice.conflictId, choice: choice.choice, note: choice.note },
    });
  }

  // Append to head. A candidate_overrides choice is exactly "apply the candidate after
  // the existing conflicting patch", which is what appending does (latest apply wins).
  const maxOrder = db
    .prepare(
      'SELECT COALESCE(MAX(merge_order), 0) AS m FROM patches WHERE project_id = ? AND merge_order IS NOT NULL',
    )
    .get(patch.projectId) as { m: number };
  const mergeOrder = maxOrder.m + 1;
  const now = new Date().toISOString();
  db.prepare(
    "UPDATE patches SET status = 'merged', merged_revision = ?, merge_order = ?, updated_at = ? WHERE id = ?",
  ).run(patch.revision, mergeOrder, now, patchId);

  const merged = getPatchOrThrow(db, patchId);
  audit.append({
    projectId: patch.projectId,
    type: 'patch.merged',
    actorId,
    subject: { type: 'patch', id: patchId },
    data: {
      revision: merged.revision,
      mergedRevision: merged.mergedRevision,
      mergeOrder,
      conflictIds: choices.map((c) => c.conflictId),
    },
  });
  return { patch: merged, report };
}
