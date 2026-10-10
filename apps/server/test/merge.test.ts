// apps/server/test/merge.test.ts (owner: Dev A) - Phase 2 step 13, T-API-MERGE.
// Integration tests via fastify.inject for the merge gate (PLAN 11.5, 11.12, 13.3):
// roles enforced, own-patch approval refused, SAME_PROPERTY blocks the merge, a
// resolution choice unblocks it, stale revision -> 409.
//
// Per PLAN 13.3 step 13 the tests use a stubbed SnapshotService and a stubbed engine
// so the gate is deterministic and does not depend on Playwright capture. One test
// also exercises the REAL engine (jsdom + analyzeConflicts) end to end to prove the
// SAME_PROPERTY rule genuinely blocks.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Conflict, ConflictReport, Patch, ServiceRegistry, Snapshot } from '@patchwork/shared';
import { USER_HEADER } from '@patchwork/shared';
import { captureFingerprint } from '@patchwork/engine';
import { documentFromHtml } from '@patchwork/engine/node';
import { buildControlApp } from '../src/app.js';
import { buildRegistry } from '../src/registry.js';
import { migrate } from '../src/db/migrate.js';
import { openDb, type Db } from '../src/db/sqlite.js';
import { SEED_PROJECT, SEED_USERS } from '../src/db/seed-data.js';
import { createAuditService } from '../src/core/audit.js';
import { addReview, createPatch, submitPatch } from '../src/core/patches.js';
import type { MergeEngine } from '../src/core/merge.js';

const PAGE_URL = 'http://localhost:4200/cart';
const FIXTURE =
  '<!doctype html><html><body><main><button id="btn" class="btn">Buy now</button></main></body></html>';

// The fixed document the stubbed SnapshotService hands to the gate.
const SNAPSHOT: Snapshot = {
  id: 'snp_test',
  projectId: SEED_PROJECT.id,
  path: '/cart',
  domHash: 'hash0',
  html: FIXTURE,
  boxes: {},
  capturedAt: '2026-10-10T00:00:00.000Z',
};

interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}

let db: Db;
let audit: ReturnType<typeof createAuditService>;

function freshDb(): Db {
  const d = openDb(':memory:');
  migrate(d);
  const insertUser = d.prepare('INSERT OR REPLACE INTO users (id, name, role) VALUES (?, ?, ?)');
  for (const u of SEED_USERS) insertUser.run(u.id, u.name, u.role);
  d.prepare(
    'INSERT OR REPLACE INTO projects (id, name, upstream_origin, paths_json, live_release_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(
    SEED_PROJECT.id,
    SEED_PROJECT.name,
    SEED_PROJECT.upstreamOrigin,
    JSON.stringify(SEED_PROJECT.paths),
    null,
    SEED_PROJECT.createdAt,
  );
  return d;
}

/** A real fingerprint captured from the fixture, so the real engine resolves it. */
function fingerprint() {
  const { document } = documentFromHtml(FIXTURE, PAGE_URL);
  const el = document.querySelector('#btn');
  if (!el) throw new Error('fixture missing #btn');
  return captureFingerprint(el, { capturedFromHash: SNAPSHOT.domHash });
}

function makePatch(authorId: string, value: string, title: string): Patch {
  return createPatch(
    db,
    audit,
    SEED_PROJECT.id,
    {
      title,
      description: 'demo',
      urlPath: '/cart',
      anchors: { a1: fingerprint() },
      ops: [{ kind: 'setText', target: { anchor: 'a1' }, value }],
      checks: [],
      baseSnapshotId: SNAPSHOT.id,
      baseValues: { 0: 'Buy now' },
    },
    authorId,
  );
}

/** Drive a patch to 'approved' through the real step-12 functions. */
function approve(patch: Patch, reviewerId: string): void {
  submitPatch(db, audit, patch.id, patch.authorId);
  addReview(db, audit, patch.id, 'approve', 'lgtm', reviewerId);
}

function appWith(engine?: MergeEngine) {
  const registry: ServiceRegistry = buildRegistry(db);
  // Stubbed SnapshotService (PLAN 13.3 step 13): latest() always returns the fixture.
  registry.snapshots = {
    latest: () => SNAPSHOT,
    get: () => SNAPSHOT,
    capture: async () => SNAPSHOT,
  };
  return { app: buildControlApp({ registry, db, mergeEngine: engine }), registry };
}

const H = (id: string) => ({ [USER_HEADER]: id });

function blockingConflict(): Conflict {
  return {
    id: 'cf_same',
    type: 'SAME_PROPERTY',
    severity: 'blocking',
    patchIds: ['pat_x'],
    elementPath: 'button#btn',
    property: 'text',
    values: { base: 'Buy now', candidate: 'Y', existing: 'X' },
    message: 'Both patches set text on the same element with different values',
    resolutions: ['candidate_overrides', 'withdraw_candidate_op', 'edit_patch'],
  };
}

function stubEngine(conflicts: Conflict[]): MergeEngine {
  return {
    documentFromHtml: () => ({ document: {} as Document, window: {} as Window }),
    analyzeConflicts: (_doc, against, candidates) => ({
      candidateIds: candidates.map((c) => c.patchId),
      againstIds: against.map((p) => p.patchId),
      resolutions: {},
      conflicts,
      blocking: conflicts.some((c) => c.severity === 'blocking'),
    }),
  };
}

beforeEach(() => {
  db = freshDb();
  audit = createAuditService(db);
});
afterEach(() => db.close());

describe('merge gate (T-API-MERGE)', () => {
  it('403 FORBIDDEN when a developer tries to merge', async () => {
    const p1 = makePatch('usr_dev1', 'X', 'p1');
    approve(p1, 'usr_rev');
    const { app } = appWith();
    const res = await app.inject({
      method: 'POST',
      url: `/api/patches/${p1.id}/merge`,
      headers: H('usr_dev2'),
      payload: {},
    });
    expect(res.statusCode).toBe(403);
    expect((res.json() as ErrorBody).error.code).toBe('FORBIDDEN');
    await app.close();
  });

  it('403 FORBIDDEN when a reviewer approves their own patch', async () => {
    const own = makePatch('usr_rev', 'X', 'own');
    submitPatch(db, audit, own.id, 'usr_rev');
    const { app } = appWith();
    const res = await app.inject({
      method: 'POST',
      url: `/api/patches/${own.id}/reviews`,
      headers: H('usr_rev'),
      payload: { decision: 'approve', comment: 'self' },
    });
    expect(res.statusCode).toBe(403);
    expect((res.json() as ErrorBody).error.code).toBe('FORBIDDEN');
    await app.close();
  });

  it('403 FORBIDDEN for an unknown user header', async () => {
    const p1 = makePatch('usr_dev1', 'X', 'p1');
    approve(p1, 'usr_rev');
    const { app } = appWith();
    const res = await app.inject({
      method: 'POST',
      url: `/api/patches/${p1.id}/merge`,
      headers: H('usr_ghost'),
      payload: {},
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('409 INVALID_STATE when merging a patch that is not approved', async () => {
    const p1 = makePatch('usr_dev1', 'X', 'p1'); // draft
    const { app } = appWith();
    const res = await app.inject({
      method: 'POST',
      url: `/api/patches/${p1.id}/merge`,
      headers: H('usr_rev'),
      payload: {},
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as ErrorBody).error.code).toBe('INVALID_STATE');
    await app.close();
  });

  it('409 STALE_REVISION when expectedRevision does not match', async () => {
    const p1 = makePatch('usr_dev1', 'X', 'p1');
    approve(p1, 'usr_rev');
    const { app } = appWith();
    const res = await app.inject({
      method: 'POST',
      url: `/api/patches/${p1.id}/merge`,
      headers: H('usr_rev'),
      payload: { expectedRevision: p1.revision + 5 },
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as ErrorBody).error.code).toBe('STALE_REVISION');
    await app.close();
  });

  it('first merge appends to head and audits patch.merged', async () => {
    const p1 = makePatch('usr_dev1', 'X', 'p1');
    approve(p1, 'usr_rev');
    const { app, registry } = appWith();
    const res = await app.inject({
      method: 'POST',
      url: `/api/patches/${p1.id}/merge`,
      headers: H('usr_rev'),
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { patch: Patch; report: ConflictReport };
    expect(body.patch.status).toBe('merged');
    expect(body.patch.mergedRevision).toBe(p1.revision);
    expect(body.report.conflicts).toEqual([]);
    expect(registry.core.listHead(SEED_PROJECT.id).map((p) => p.patchId)).toEqual([p1.id]);
    const merged = audit.list(SEED_PROJECT.id, { type: 'patch.merged' });
    expect(merged.some((e) => e.subject.id === p1.id)).toBe(true);
    await app.close();
  });

  it('SAME_PROPERTY blocks the second merge with the report in details', async () => {
    const p1 = makePatch('usr_dev1', 'X', 'p1');
    approve(p1, 'usr_rev');
    const p2 = makePatch('usr_dev2', 'Y', 'p2');
    approve(p2, 'usr_rev');
    const { app } = appWith();
    const first = await app.inject({
      method: 'POST',
      url: `/api/patches/${p1.id}/merge`,
      headers: H('usr_rev'),
      payload: {},
    });
    expect(first.statusCode).toBe(200);

    const res = await app.inject({
      method: 'POST',
      url: `/api/patches/${p2.id}/merge`,
      headers: H('usr_rm'),
      payload: {},
    });
    expect(res.statusCode).toBe(409);
    const body = res.json() as ErrorBody;
    expect(body.error.code).toBe('MERGE_BLOCKED');
    const details = body.error.details as { conflicts: Conflict[]; report: ConflictReport };
    expect(details.conflicts.some((c) => c.type === 'SAME_PROPERTY')).toBe(true);
    expect(details.report.blocking).toBe(true);

    const detected = audit.list(SEED_PROJECT.id, { type: 'conflict.detected' });
    expect(detected.some((e) => e.subject.id === p2.id)).toBe(true);
    await app.close();
  });

  it('a candidate_overrides choice unblocks the merge and is audited', async () => {
    const p1 = makePatch('usr_dev1', 'X', 'p1');
    approve(p1, 'usr_rev');
    const p2 = makePatch('usr_dev2', 'Y', 'p2');
    approve(p2, 'usr_rev');
    const { app, registry } = appWith();
    await app.inject({
      method: 'POST',
      url: `/api/patches/${p1.id}/merge`,
      headers: H('usr_rev'),
      payload: {},
    });
    const blocked = await app.inject({
      method: 'POST',
      url: `/api/patches/${p2.id}/merge`,
      headers: H('usr_rm'),
      payload: {},
    });
    const blockedBody = blocked.json() as ErrorBody;
    const conflictId = (blockedBody.error.details as { conflicts: Conflict[] }).conflicts.find(
      (c) => c.type === 'SAME_PROPERTY',
    )!.id;

    const res = await app.inject({
      method: 'POST',
      url: `/api/patches/${p2.id}/merge`,
      headers: H('usr_rm'),
      payload: { choices: [{ conflictId, choice: 'candidate_overrides', note: 'latest wins' }] },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { patch: Patch }).patch.status).toBe('merged');

    // p2 appended after p1, so on apply p2's value wins (candidate_overrides).
    expect(registry.core.listHead(SEED_PROJECT.id).map((p) => p.patchId)).toEqual([p1.id, p2.id]);
    const resolved = audit.list(SEED_PROJECT.id, { type: 'conflict.resolved' });
    expect(resolved.some((e) => e.data.conflictId === conflictId)).toBe(true);
    await app.close();
  });

  it('rejects a resolution choice that is not allowed for the conflict', async () => {
    const p1 = makePatch('usr_dev1', 'X', 'p1');
    approve(p1, 'usr_rev');
    const p2 = makePatch('usr_dev2', 'Y', 'p2');
    approve(p2, 'usr_rev');
    const { app } = appWith();
    await app.inject({
      method: 'POST',
      url: `/api/patches/${p1.id}/merge`,
      headers: H('usr_rev'),
      payload: {},
    });
    const blocked = await app.inject({
      method: 'POST',
      url: `/api/patches/${p2.id}/merge`,
      headers: H('usr_rm'),
      payload: {},
    });
    const conflictId = ((blocked.json() as ErrorBody).error.details as { conflicts: Conflict[] }).conflicts.find(
      (c) => c.type === 'SAME_PROPERTY',
    )!.id;

    const res = await app.inject({
      method: 'POST',
      url: `/api/patches/${p2.id}/merge`,
      headers: H('usr_rm'),
      payload: { choices: [{ conflictId, choice: 'reorder', note: '' }] },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as ErrorBody).error.code).toBe('VALIDATION_FAILED');
    await app.close();
  });

  it('a stubbed engine drives the gate (decoupled from the real engine)', async () => {
    const p1 = makePatch('usr_dev1', 'X', 'p1');
    approve(p1, 'usr_rev');
    const { app } = appWith(stubEngine([blockingConflict()]));

    const blocked = await app.inject({
      method: 'POST',
      url: `/api/patches/${p1.id}/merge`,
      headers: H('usr_rev'),
      payload: {},
    });
    expect(blocked.statusCode).toBe(409);
    expect((blocked.json() as ErrorBody).error.code).toBe('MERGE_BLOCKED');

    const ok = await app.inject({
      method: 'POST',
      url: `/api/patches/${p1.id}/merge`,
      headers: H('usr_rev'),
      payload: { choices: [{ conflictId: 'cf_same', choice: 'candidate_overrides', note: '' }] },
    });
    expect(ok.statusCode).toBe(200);
    await app.close();
  });

  it('POST /projects/:pid/conflicts returns a ConflictReport', async () => {
    const p1 = makePatch('usr_dev1', 'X', 'p1');
    const { app } = appWith();
    const res = await app.inject({
      method: 'POST',
      url: `/api/projects/${SEED_PROJECT.id}/conflicts`,
      headers: H('usr_rev'),
      payload: { candidateIds: [p1.id] },
    });
    expect(res.statusCode).toBe(200);
    const report = res.json() as ConflictReport;
    expect(report.projectId).toBe(SEED_PROJECT.id);
    expect(report.snapshotId).toBe(SNAPSHOT.id);
    expect(report.candidateIds).toEqual([p1.id]);
    expect(Array.isArray(report.conflicts)).toBe(true);
    expect(typeof report.blocking).toBe('boolean');
    await app.close();
  });

  it('POST /projects/:pid/conflicts requires at least one candidate', async () => {
    const { app } = appWith();
    const res = await app.inject({
      method: 'POST',
      url: `/api/projects/${SEED_PROJECT.id}/conflicts`,
      headers: H('usr_rev'),
      payload: { candidateIds: [] },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as ErrorBody).error.code).toBe('VALIDATION_FAILED');
    await app.close();
  });
});
