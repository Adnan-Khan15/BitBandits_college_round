// apps/server/src/core/patches.test.ts (owner: Dev A) - Phase 2 step 12
// State machine, revisions, roles and audit events per PLAN 11.3.
// (T-API-MERGE integration tests via fastify.inject land with step 13.)
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuditService } from './audit.js';
import {
  addReview,
  createPatch,
  getPatch,
  listPatches,
  requireUser,
  submitPatch,
  updatePatch,
} from './patches.js';
import { migrate } from '../db/migrate.js';
import { openDb, type Db } from '../db/sqlite.js';
import { SEED_PROJECT, SEED_USERS } from '../db/seed-data.js';

const db: Db = openDb(':memory:');
migrate(db);
for (const u of SEED_USERS) {
  db.prepare('INSERT OR REPLACE INTO users (id, name, role) VALUES (?, ?, ?)').run(u.id, u.name, u.role);
}
db.prepare(
  'INSERT OR REPLACE INTO projects (id, name, upstream_origin, paths_json, live_release_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
).run(SEED_PROJECT.id, SEED_PROJECT.name, SEED_PROJECT.upstreamOrigin, JSON.stringify(SEED_PROJECT.paths), null, SEED_PROJECT.createdAt);

const audit = createAuditService(db);
let seq = 0;
afterAll(() => db.close());

const goodBody = () => ({
  urlPath: '/cart',
  anchors: {
    a1: {
      v: 1 as const,
      tag: 'button',
      id: 'checkout-btn',
      testId: null,
      name: null,
      classes: ['btn'],
      text: 'Proceed to checkout',
      accessibleName: 'Proceed to checkout',
      role: 'button',
      attrs: {},
      cssPath: 'button#checkout-btn',
      xpath: '//button[@id="checkout-btn"]',
      ancestors: [],
      siblingIndex: 0,
      neighborText: '',
      rect: null,
      capturedAt: new Date().toISOString(),
      capturedFromHash: 'hash0',
    },
  },
  ops: [{ kind: 'setText' as const, target: { anchor: 'a1' }, value: 'Checkout now' }],
  checks: [],
  baseSnapshotId: null,
  baseValues: { 0: 'Proceed to checkout' },
});

const newPatch = (title = 'Fix checkout button') =>
  createPatch(db, audit, SEED_PROJECT.id, { title, description: 'demo', ...goodBody() }, 'usr_dev1');

describe('patch CRUD and lifecycle (step 12)', () => {
  it('creates a draft at revision 1 and audits patch.created', () => {
    const patch = newPatch();
    expect(patch.status).toBe('draft');
    expect(patch.revision).toBe(1);
    expect(patch.mergedRevision).toBeNull();
    const events = audit.list(SEED_PROJECT.id, { type: 'patch.created' });
    expect(events.some((e) => e.subject.id === patch.id)).toBe(true);
  });

  it('updates with expectedRevision and archives the old revision', () => {
    const patch = newPatch();
    const updated = updatePatch(
      db,
      audit,
      patch.id,
      { expectedRevision: 1, ops: [{ kind: 'hide', target: { anchor: 'a1' } }] },
      'usr_dev1',
    );
    expect(updated.revision).toBe(2);
    expect(updated.ops[0]?.kind).toBe('hide');
    const archived = db
      .prepare('SELECT revision FROM patch_revisions WHERE patch_id = ? ORDER BY revision')
      .all(patch.id) as Array<{ revision: number }>;
    expect(archived.map((r) => r.revision)).toEqual([1]);
    expect(audit.list(SEED_PROJECT.id, { type: 'patch.updated' }).some((e) => e.subject.id === patch.id)).toBe(true);
  });

  it('rejects a stale expectedRevision with 409 STALE_REVISION', () => {
    const patch = newPatch();
    updatePatch(db, audit, patch.id, { expectedRevision: 1, title: 'v2' }, 'usr_dev1');
    expect(() => updatePatch(db, audit, patch.id, { expectedRevision: 1 }, 'usr_dev1')).toThrowError(
      /revision 2/,
    );
  });

  it('refuses edits by another developer', () => {
    const patch = newPatch();
    expect(() => updatePatch(db, audit, patch.id, { expectedRevision: 1 }, 'usr_dev2')).toThrowError(
      /own patch/,
    );
  });

  it('refuses editing while in_review or approved (INVALID_STATE)', () => {
    const patch = newPatch();
    submitPatch(db, audit, patch.id, 'usr_dev1');
    // Still revision 1: submit does not bump the revision.
    expect(() => updatePatch(db, audit, patch.id, { expectedRevision: 1, title: 'x' }, 'usr_dev1')).toThrowError(
      /in_review/,
    );
  });

  it('submits draft -> in_review and audits patch.submitted', () => {
    const patch = newPatch();
    const submitted = submitPatch(db, audit, patch.id, 'usr_dev1');
    expect(submitted.status).toBe('in_review');
    expect(audit.list(SEED_PROJECT.id, { type: 'patch.submitted' }).some((e) => e.subject.id === patch.id)).toBe(true);
  });

  it('refuses submit by a non-author', () => {
    const patch = newPatch();
    expect(() => submitPatch(db, audit, patch.id, 'usr_dev2')).toThrowError(/own patch/);
  });

  it('approves in_review -> approved by a reviewer, never the author', () => {
    const patch = newPatch('for author-review');
    // Temporarily make the author a reviewer so the own-patch rule fires on its own
    // (a developer author is already blocked by the role check, covered below).
    db.prepare('UPDATE patches SET author_id = ? WHERE id = ?').run('usr_rev', patch.id);
    db.prepare("UPDATE patches SET status = 'in_review' WHERE id = ?").run(patch.id);
    expect(() => addReview(db, audit, patch.id, 'approve', 'lgtm', 'usr_rev')).toThrowError(/own patch/);

    // Restore the normal case: developer author, reviewer approval.
    db.prepare('UPDATE patches SET author_id = ? WHERE id = ?').run('usr_dev1', patch.id);
    const review = addReview(db, audit, patch.id, 'approve', 'lgtm', 'usr_rev');
    expect(review.decision).toBe('approve');
    expect(getPatch(db, patch.id)?.status).toBe('approved');
    expect(audit.list(SEED_PROJECT.id, { type: 'patch.reviewed' }).some((e) => e.subject.id === patch.id)).toBe(true);
  });

  it('refuses review by a developer role', () => {
    const patch = newPatch();
    submitPatch(db, audit, patch.id, 'usr_dev1');
    expect(() => addReview(db, audit, patch.id, 'comment', 'note', 'usr_dev2')).toThrowError(/cannot review/);
  });

  it('moves merged patches back to draft as a NEW revision when edited (PLAN 11.3)', () => {
    const patch = newPatch();
    submitPatch(db, audit, patch.id, 'usr_dev1');
    addReview(db, audit, patch.id, 'request_changes', 'needs work', 'usr_rev');
    // Simulate a merged patch (merge itself is step 13): revision 1 is in head.
    db.prepare('UPDATE patches SET status = ?, merged_revision = ? WHERE id = ?').run('merged', 1, patch.id);
    const reopened = updatePatch(db, audit, patch.id, { expectedRevision: 1, title: 'tweak' }, 'usr_dev1');
    expect(reopened.status).toBe('draft');
    expect(reopened.revision).toBe(2);
    expect(reopened.mergedRevision).toBe(1); // head keeps the merged revision until the new one merges
  });

  it('lists patches newest-first and filters by status', () => {
    const patch = newPatch();
    submitPatch(db, audit, patch.id, 'usr_dev1');
    const inReview = listPatches(db, SEED_PROJECT.id, 'in_review');
    expect(inReview.some((p) => p.id === patch.id)).toBe(true);
    const drafts = listPatches(db, SEED_PROJECT.id, 'draft');
    expect(drafts.every((p) => p.status === 'draft')).toBe(true);
    const all = listPatches(db, SEED_PROJECT.id);
    expect(all.length).toBeGreaterThan(inReview.length);
  });

  it('requireUser rejects missing and unknown identities', () => {
    expect(() => requireUser(db, undefined)).toThrowError(/Missing X-Patchwork-User/);
    expect(() => requireUser(db, 'usr_nope')).toThrowError(/Unknown user/);
    expect(requireUser(db, 'usr_rev').role).toBe('reviewer');
  });

  it('assigns unique ids across patches', () => {
    const a = newPatch();
    const b = newPatch();
    expect(a.id).not.toBe(b.id);
    expect(a.id.startsWith('pat_')).toBe(true);
    seq = a.id.length + b.id.length;
    expect(seq).toBeGreaterThan(20);
  });
});
