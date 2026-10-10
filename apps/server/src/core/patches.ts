// apps/server/src/core/patches.ts (owner: Dev A)
// Phase 2 step 12 (PLAN 11.3, 11.12): patch CRUD, revisions, submit, reviews,
// state machine. Every state change appends exactly one audit event.
// The merge gate (conflict analysis) is step 13 and lands in core/merge.ts.
import { nanoid } from 'nanoid';
import type { Patch, PatchBody, PatchStatus, Review, Role, User } from '@patchwork/shared';
import type { AuditService } from '@patchwork/shared';
import { AppError } from '@patchwork/shared';
import type { Db } from '../db/sqlite.js';
import { validatePatchBody } from './validate.js';

// --- state machine (PLAN 11.3) ------------------------------------------------
// draft -> in_review -> (changes_requested -> in_review)* -> approved -> merged, or rejected.
// Editing a merged patch creates a new revision in draft; head keeps mergedRevision
// until the new revision is merged.

export const TRANSITIONS: Record<PatchStatus, PatchStatus[]> = {
  draft: ['in_review'],
  in_review: ['approved', 'changes_requested', 'rejected'],
  changes_requested: ['in_review'],
  approved: ['merged', 'rejected'],
  merged: ['draft'],
  rejected: ['in_review'],
};

function assertTransition(from: PatchStatus, to: PatchStatus, patchId: string): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new AppError('INVALID_STATE', `Cannot move patch ${patchId} from ${from} to ${to}`, {
      from,
      to,
      allowed: TRANSITIONS[from],
    });
  }
}

// --- row mapping -----------------------------------------------------------------

type PatchRow = {
  id: string;
  project_id: string;
  title: string;
  description: string;
  author_id: string;
  status: string;
  revision: number;
  merged_revision: number | null;
  merge_order: number | null;
  body_json: string;
  created_at: string;
  updated_at: string;
};

export function rowToPatch(r: PatchRow): Patch {
  return {
    ...(JSON.parse(r.body_json) as PatchBody),
    id: r.id,
    projectId: r.project_id,
    title: r.title,
    description: r.description,
    authorId: r.author_id,
    status: r.status as PatchStatus,
    revision: r.revision,
    mergedRevision: r.merged_revision,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** The six PatchBody fields, extracted from a stored Patch row. */
export function bodyOf(patch: Patch): PatchBody {
  return {
    urlPath: patch.urlPath,
    anchors: patch.anchors,
    ops: patch.ops,
    checks: patch.checks,
    baseSnapshotId: patch.baseSnapshotId,
    baseValues: patch.baseValues,
  };
}

// --- identity / roles (PLAN 11.3) -------------------------------------------------

export function requireUser(db: Db, userId: string | undefined): User {
  if (!userId) throw new AppError('FORBIDDEN', 'Missing X-Patchwork-User header');
  const row = db
    .prepare('SELECT id, name, role FROM users WHERE id = ?')
    .get(userId) as { id: string; name: string; role: string } | undefined;
  if (!row) throw new AppError('FORBIDDEN', `Unknown user "${userId}"`);
  return { id: row.id, name: row.name, role: row.role as Role };
}

export function requireReviewer(user: User, patch: Patch): void {
  if (user.role !== 'reviewer' && user.role !== 'release_manager') {
    throw new AppError('FORBIDDEN', `Role ${user.role} cannot review or merge patches`, { role: user.role });
  }
  if (user.id === patch.authorId) {
    throw new AppError('FORBIDDEN', 'You cannot review or merge your own patch');
  }
}

// --- repository + domain ops ------------------------------------------------------

export function getPatch(db: Db, id: string): Patch | null {
  const row = db.prepare('SELECT * FROM patches WHERE id = ?').get(id) as PatchRow | undefined;
  return row ? rowToPatch(row) : null;
}

export function getPatchOrThrow(db: Db, id: string): Patch {
  const patch = getPatch(db, id);
  if (!patch) throw new AppError('NOT_FOUND', `No patch ${id}`);
  return patch;
}

export function listPatches(db: Db, projectId: string, status?: string): Patch[] {
  const rows = (
    status
      ? db
          .prepare('SELECT * FROM patches WHERE project_id = ? AND status = ? ORDER BY created_at DESC, id DESC')
          .all(projectId, status)
      : db
          .prepare('SELECT * FROM patches WHERE project_id = ? ORDER BY created_at DESC, id DESC')
          .all(projectId)
  ) as PatchRow[];
  return rows.map(rowToPatch);
}

export interface CreatePatchInput extends PatchBody {
  title: string;
  description: string;
}

export function createPatch(
  db: Db,
  audit: AuditService,
  projectId: string,
  input: CreatePatchInput,
  authorId: string,
): Patch {
  const { title, description, ...body } = input;
  const now = new Date().toISOString();
  const id = `pat_${nanoid(12)}`;
  db.prepare(
    'INSERT INTO patches (id, project_id, title, description, author_id, status, revision, merged_revision, merge_order, body_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    id,
    projectId,
    title,
    description,
    authorId,
    'draft',
    1,
    null,
    null,
    JSON.stringify(body),
    now,
    now,
  );
  const created = getPatchOrThrow(db, id);
  audit.append({
    projectId,
    type: 'patch.created',
    actorId: authorId,
    subject: { type: 'patch', id },
    data: { title, revision: created.revision },
  });
  return created;
}

export interface UpdatePatchInput {
  expectedRevision: number;
  title?: string;
  description?: string;
  urlPath?: string;
  anchors?: PatchBody['anchors'];
  ops?: PatchBody['ops'];
  checks?: PatchBody['checks'];
  baseSnapshotId?: PatchBody['baseSnapshotId'];
  baseValues?: PatchBody['baseValues'];
}

export function updatePatch(
  db: Db,
  audit: AuditService,
  id: string,
  input: UpdatePatchInput,
  actorId: string,
): Patch {
  const row = db.prepare('SELECT * FROM patches WHERE id = ?').get(id) as PatchRow | undefined;
  if (!row) throw new AppError('NOT_FOUND', `No patch ${id}`);
  const patch = rowToPatch(row);

  if (patch.authorId !== actorId) {
    throw new AppError('FORBIDDEN', 'You can only edit your own patch');
  }
  if (patch.revision !== input.expectedRevision) {
    throw new AppError(
      'STALE_REVISION',
      `Patch ${id} is at revision ${patch.revision}; reload before saving`,
      { expected: input.expectedRevision, actual: patch.revision },
    );
  }
  if (patch.status === 'in_review' || patch.status === 'approved') {
    throw new AppError(
      'INVALID_STATE',
      `Patch ${id} is ${patch.status}; editing is allowed only in draft, changes_requested, or on a merged patch (which opens a new draft revision)`,
      { status: patch.status },
    );
  }

  const nextBody: PatchBody = {
    urlPath: input.urlPath ?? patch.urlPath,
    anchors: input.anchors ?? patch.anchors,
    ops: input.ops ?? patch.ops,
    checks: input.checks ?? patch.checks,
    baseSnapshotId: input.baseSnapshotId !== undefined ? input.baseSnapshotId : patch.baseSnapshotId,
    baseValues: input.baseValues ?? patch.baseValues,
  };
  const nextRevision = patch.revision + 1;
  const nextStatus: PatchStatus = patch.status === 'merged' ? 'draft' : patch.status;
  const now = new Date().toISOString();

  // Archive the revision being replaced, then write the new one (append-only history).
  db.prepare(
    'INSERT OR REPLACE INTO patch_revisions (patch_id, revision, title, body_json, author_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(patch.id, patch.revision, patch.title, row.body_json, actorId, patch.createdAt);

  db.prepare(
    'UPDATE patches SET title = COALESCE(?, title), description = COALESCE(?, description), revision = ?, status = ?, body_json = ?, updated_at = ? WHERE id = ?',
  ).run(
    input.title ?? null,
    input.description ?? null,
    nextRevision,
    nextStatus,
    JSON.stringify(nextBody),
    now,
    id,
  );

  const updated = getPatchOrThrow(db, id);
  audit.append({
    projectId: updated.projectId,
    type: 'patch.updated',
    actorId,
    subject: { type: 'patch', id },
    data: { revision: updated.revision, previousRevision: patch.revision },
  });
  return updated;
}

export function submitPatch(db: Db, audit: AuditService, id: string, actorId: string): Patch {
  const patch = getPatchOrThrow(db, id);
  if (patch.authorId !== actorId) {
    throw new AppError('FORBIDDEN', 'You can only submit your own patch');
  }
  if (patch.status !== 'draft' && patch.status !== 'changes_requested') {
    throw new AppError(
      'INVALID_STATE',
      `Patch ${id} is ${patch.status}; only draft or changes_requested can be submitted`,
      { status: patch.status },
    );
  }
  // Defense in depth: the UI validates before submit (PLAN section 7, C3); the server
  // also refuses invalid bodies here (rules live in validate.ts, PLAN 11.4).
  const validation = validatePatchBody(bodyOf(patch));
  if (!validation.valid) {
    throw new AppError('VALIDATION_FAILED', 'Patch body is invalid', validation.issues);
  }
  assertTransition(patch.status, 'in_review', id);
  db.prepare('UPDATE patches SET status = ?, updated_at = ? WHERE id = ?').run(
    'in_review',
    new Date().toISOString(),
    id,
  );
  const updated = getPatchOrThrow(db, id);
  audit.append({
    projectId: updated.projectId,
    type: 'patch.submitted',
    actorId,
    subject: { type: 'patch', id },
    data: { revision: updated.revision },
  });
  return updated;
}

export function addReview(
  db: Db,
  audit: AuditService,
  id: string,
  decision: 'approve' | 'request_changes' | 'comment',
  comment: string,
  reviewerId: string,
): Review {
  const patch = getPatchOrThrow(db, id);
  const reviewer = requireUser(db, reviewerId);
  requireReviewer(reviewer, patch);

  const reviewId = `rev_${nanoid(12)}`;
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO reviews (id, patch_id, revision, reviewer_id, decision, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(reviewId, id, patch.revision, reviewerId, decision, comment, now);

  let nextStatus: PatchStatus | null = null;
  if (decision === 'approve' || decision === 'request_changes') {
    if (patch.status !== 'in_review') {
      throw new AppError('INVALID_STATE', `Patch ${id} is ${patch.status}; only in_review patches can be reviewed`, {
        status: patch.status,
      });
    }
    nextStatus = decision === 'approve' ? 'approved' : 'changes_requested';
    assertTransition(patch.status, nextStatus, id);
    db.prepare('UPDATE patches SET status = ?, updated_at = ? WHERE id = ?').run(nextStatus, now, id);
  }

  audit.append({
    projectId: patch.projectId,
    type: 'patch.reviewed',
    actorId: reviewerId,
    subject: { type: 'patch', id },
    data: { decision, revision: patch.revision, reviewId, resultingStatus: nextStatus },
  });

  return { id: reviewId, patchId: id, revision: patch.revision, reviewerId, decision, comment, createdAt: now };
}

/** Merge (step 13) needs the candidate's body; kept here so both modules agree. */
export { bodyOf as patchBodyOf };

/**
 * Drift heal (PLAN 11.13, step 14): a NEW revision of a patch with refreshed anchors,
 * moved to in_review with its mergedRevision preserved so head keeps the live revision
 * until the heal is reviewed and merged. The actor may be 'system' (a poller).
 *
 * Audits `patch.heal_proposed` with the caller's note (PLAN 11.13/step 14). Dev B's
 * drift.check also appends the same event -> duplicate; open change request A-drift-1
 * asks Dev B to drop his append (the plan assigns the audit to proposeHeal).
 */
export function proposeHeal(
  db: Db,
  audit: AuditService,
  id: string,
  anchors: PatchBody['anchors'],
  actorId: string | 'system',
  note: string,
): Patch {
  const row = db.prepare('SELECT * FROM patches WHERE id = ?').get(id) as PatchRow | undefined;
  if (!row) throw new AppError('NOT_FOUND', `No patch ${id}`);
  const patch = rowToPatch(row);
  if (patch.mergedRevision === null) {
    throw new AppError('INVALID_STATE', `Patch ${id} has never been merged; nothing to heal`, {
      status: patch.status,
    });
  }
  if (actorId !== 'system') requireUser(db, actorId); // unknown actor -> 403

  const nextBody: PatchBody = { ...bodyOf(patch), anchors };
  const nextRevision = patch.revision + 1;
  const now = new Date().toISOString();

  // Append-only history: archive the revision being replaced.
  db.prepare(
    'INSERT OR REPLACE INTO patch_revisions (patch_id, revision, title, body_json, author_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(patch.id, patch.revision, patch.title, row.body_json, actorId, patch.createdAt);

  db.prepare(
    "UPDATE patches SET revision = ?, status = 'in_review', body_json = ?, updated_at = ? WHERE id = ?",
  ).run(nextRevision, JSON.stringify(nextBody), now, id);

  audit.append({
    projectId: patch.projectId,
    type: 'patch.heal_proposed',
    actorId,
    subject: { type: 'patch', id },
    data: { revision: nextRevision, previousRevision: patch.revision, note },
  });

  return getPatchOrThrow(db, id);
}
