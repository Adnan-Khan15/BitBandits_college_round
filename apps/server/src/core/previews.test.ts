// apps/server/src/core/previews.test.ts (owner: Dev A) - Phase 2 step 14.
// Unit tests for previews and the drift heal (PLAN 11.6, 11.13): spec storage + 2 h
// expiry, manifest from head/live/release with include-exclude and the draft, and
// proposeHeal creating a new in_review revision that keeps head on the merged one.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ElementFingerprint, PatchBody, Patch, PreviewSpec, ServiceRegistry } from '@patchwork/shared';
import { captureFingerprint } from '@patchwork/engine';
import { documentFromHtml } from '@patchwork/engine/node';
import { buildRegistry } from '../registry.js';
import { migrate } from '../db/migrate.js';
import { openDb, type Db } from '../db/sqlite.js';
import { SEED_PROJECT, SEED_USERS } from '../db/seed-data.js';
import { createAuditService } from './audit.js';
import { createPatch } from './patches.js';

const PAGE = 'http://localhost:4200/';
const HTML_BEFORE = '<!doctype html><html><body><button id="btn">Buy</button></body></html>';
const HTML_AFTER = '<!doctype html><html><body><button id="buy-btn" class="cta">Buy now</button></body></html>';

let db: Db;
let registry: ServiceRegistry;
let audit: ReturnType<typeof createAuditService>;

function fp(html: string, selector: string): ElementFingerprint {
  const { document } = documentFromHtml(html, PAGE);
  const el = document.querySelector(selector);
  if (!el) throw new Error(`fixture missing ${selector}`);
  return captureFingerprint(el, { capturedFromHash: 'h0' });
}

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

function patchBody(value: string, html = HTML_BEFORE, selector = '#btn'): PatchBody {
  return {
    urlPath: '/',
    anchors: { a1: fp(html, selector) },
    ops: [{ kind: 'setText', target: { anchor: 'a1' }, value }],
    checks: [],
    baseSnapshotId: 'snp_1',
    baseValues: { 0: 'Buy' },
  };
}

function newPatch(authorId: string, value: string, html = HTML_BEFORE, selector = '#btn'): Patch {
  return createPatch(
    db,
    audit,
    SEED_PROJECT.id,
    { ...patchBody(value, html, selector), title: `t-${value}`, description: 'd' },
    authorId,
  );
}

/** Simulate a merge without the engine: mark merged at revision 1. */
function merge(patch: Patch, order: number): Patch {
  db.prepare("UPDATE patches SET status = 'merged', merged_revision = 1, merge_order = ? WHERE id = ?").run(
    order,
    patch.id,
  );
  return patch;
}

const spec = (over: Partial<PreviewSpec> = {}): PreviewSpec => ({
  base: 'head',
  include: [],
  exclude: [],
  draft: null,
  resolverMode: 'smart',
  ...over,
});

beforeEach(() => {
  db = freshDb();
  audit = createAuditService(db);
  registry = buildRegistry(db, { editorOrigin: 'http://editor.test', previewOrigin: 'http://preview.test' });
});
afterEach(() => db.close());

describe('previews', () => {
  it('createPreview stores the spec with a 2 h expiry and audits preview.created', () => {
    const preview = registry.core.createPreview(SEED_PROJECT.id, spec(), 'usr_dev1');
    expect(preview.id.startsWith('prv_')).toBe(true);
    expect(preview.projectId).toBe(SEED_PROJECT.id);
    expect(preview.spec.resolverMode).toBe('smart');
    const ttl = new Date(preview.expiresAt).getTime() - new Date(preview.createdAt).getTime();
    expect(ttl).toBe(2 * 60 * 60 * 1000);
    const events = audit.list(SEED_PROJECT.id, { type: 'preview.created' });
    expect(events.some((e) => e.subject.id === preview.id)).toBe(true);
  });

  it('createPreview rejects an unknown project', () => {
    expect(() => registry.core.createPreview('prj_nope', spec(), 'usr_dev1')).toThrowError(/No project/);
  });

  it('getPreview returns null for an unknown id', () => {
    expect(registry.core.getPreview('prv_nope')).toBeNull();
  });

  it('manifestForPreview builds a preview manifest from head plus the draft', () => {
    const patch = merge(newPatch('usr_dev1', 'Buy now'), 1);
    const draft = { ...patchBody('Go', HTML_AFTER, '#buy-btn'), title: 'Draft' };
    const preview = registry.core.createPreview(SEED_PROJECT.id, spec({ draft }), 'usr_dev1');

    const manifest = registry.core.manifestForPreview(preview.id);
    expect(manifest.channel).toBe('preview');
    expect(manifest.projectId).toBe(SEED_PROJECT.id);
    expect(manifest.previewId).toBe(preview.id);
    expect(manifest.releaseId).toBeNull();
    expect(manifest.resolverMode).toBe('smart');
    expect(manifest.editor).toEqual({ enabled: true, allowedOrigin: 'http://editor.test' });
    expect(manifest.beaconUrl).toBe('/__patchwork/beacon');
    expect(manifest.thresholds).toEqual({ exact: 0.9, relocate: 0.65, margin: 0.15 });
    expect(manifest.patches.map((p) => p.patchId)).toEqual([patch.id, 'draft']);
    expect(manifest.patches[1]!.revision).toBe(0);
  });

  it('manifestForPreview applies include then exclude', () => {
    const a = merge(newPatch('usr_dev1', 'A'), 1);
    const b = merge(newPatch('usr_dev2', 'B'), 2);

    const onlyA = registry.core.createPreview(SEED_PROJECT.id, spec({ include: [a.id] }), 'usr_dev1');
    expect(registry.core.manifestForPreview(onlyA.id).patches.map((p) => p.patchId)).toEqual([a.id]);

    const notA = registry.core.createPreview(SEED_PROJECT.id, spec({ exclude: [a.id] }), 'usr_dev1');
    expect(registry.core.manifestForPreview(notA.id).patches.map((p) => p.patchId)).toEqual([b.id]);
  });

  it('manifestForPreview 404s an unknown or expired preview', () => {
    expect(() => registry.core.manifestForPreview('prv_nope')).toThrowError(/No preview/);
    const preview = registry.core.createPreview(SEED_PROJECT.id, spec(), 'usr_dev1');
    db.prepare('UPDATE previews SET expires_at = ? WHERE id = ?').run('2000-01-01T00:00:00.000Z', preview.id);
    expect(() => registry.core.manifestForPreview(preview.id)).toThrowError(/expired/);
  });
});

describe('proposeHeal', () => {
  it('adds an in_review revision with refreshed anchors and keeps head on the merged one', () => {
    const patch = merge(newPatch('usr_dev1', 'Buy now'), 1);
    expect(registry.core.listHead(SEED_PROJECT.id).map((p) => p.patchId)).toEqual([patch.id]);

    const newFp = fp(HTML_AFTER, '#buy-btn');
    const healed = registry.core.proposeHeal(patch.id, { a1: newFp }, 'system', 'drift heal');

    expect(healed.revision).toBe(2);
    expect(healed.status).toBe('in_review');
    expect(healed.mergedRevision).toBe(1);
    expect(healed.anchors.a1).toEqual(newFp);

    // head still serves the merged revision 1 body (archived revision), unchanged.
    const head = registry.core.listHead(SEED_PROJECT.id);
    expect(head.map((p) => p.patchId)).toEqual([patch.id]);
    expect(head[0]!.revision).toBe(1);
    expect(head[0]!.anchors.a1!.cssPath).toBe('#btn');
    expect(head[0]!.anchors.a1!.id).toBe('btn');

    const archived = db
      .prepare('SELECT revision FROM patch_revisions WHERE patch_id = ? ORDER BY revision')
      .all(patch.id) as Array<{ revision: number }>;
    expect(archived.map((r) => r.revision)).toEqual([1]);

    const events = audit.list(SEED_PROJECT.id, { type: 'patch.heal_proposed' });
    expect(events.some((e) => e.subject.id === patch.id)).toBe(true);
  });

  it('refuses a patch that was never merged', () => {
    const draft = newPatch('usr_dev1', 'X');
    expect(() =>
      registry.core.proposeHeal(draft.id, { a1: fp(HTML_BEFORE, '#btn') }, 'system', 'x'),
    ).toThrowError(/never been merged/);
  });

  it("rejects an unknown non-system actor", () => {
    const patch = merge(newPatch('usr_dev1', 'Buy now'), 1);
    expect(() =>
      registry.core.proposeHeal(patch.id, { a1: fp(HTML_AFTER, '#buy-btn') }, 'usr_ghost', 'x'),
    ).toThrowError(/Unknown user/);
  });
});
