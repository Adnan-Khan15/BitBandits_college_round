// apps/server/test/drift.test.ts (owner: Dev B)
// Unit + route tests for the Drift Sentinel service (PLAN sections 6, 11.9, 11.12, 11.13).
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  AuditEvent,
  BenchRow,
  DriftReport,
  FrozenPatch,
  Patch,
  Release,
  ServiceRegistry,
  Snapshot,
} from '@patchwork/shared';
import { captureFingerprint } from '@patchwork/engine';
import { documentFromHtml } from '@patchwork/engine/node';
import { openDb } from '../src/db/sqlite.js';
import { migrate } from '../src/db/migrate.js';
import { createDriftService, registerDriftRoutes } from '../src/drift/index.js';
import { createDriftRepo } from '../src/drift/repo.js';

const URL_ = 'http://localhost:4200/cart';
const HASH_BEFORE = 'H1';
const HASH_AFTER = 'H2';

// #cart is unchanged (healthy), #buy is renamed+reclassed (healed), #promo is removed (broken).
const BEFORE = `<!doctype html><html><body>
<nav><a id="home" href="/">Home</a><a id="cart" class="nav-link" href="/cart">Cart</a></nav>
<main>
  <button id="buy" class="btn primary" type="button">Buy now</button>
  <div id="promo" class="banner">Sale</div>
</main>
</body></html>`;

const AFTER = `<!doctype html><html><body>
<nav><a id="home" href="/">Home</a><a id="cart" class="nav-link" href="/cart">Cart</a></nav>
<main>
  <button id="checkout" class="btn cta" type="button">Buy now</button>
</main>
</body></html>`;

function fingerprintFrom(html: string, selector: string) {
  const { document } = documentFromHtml(html, URL_);
  const el = document.querySelector(selector);
  if (!el) throw new Error(`fixture missing ${selector}`);
  return captureFingerprint(el, { capturedFromHash: HASH_BEFORE });
}

function frozenPatch(patchId: string, selector: string): FrozenPatch {
  return {
    patchId,
    revision: 1,
    title: patchId,
    urlPath: '/cart',
    anchors: { a: fingerprintFrom(BEFORE, selector) },
    ops: [{ kind: 'hide', target: { anchor: 'a' } }],
    checks: [],
    baseSnapshotId: null,
    baseValues: {},
  };
}

const PATCHES: FrozenPatch[] = [
  frozenPatch('pat_healthy', '#cart'),
  frozenPatch('pat_healed', '#buy'),
  frozenPatch('pat_broken', '#promo'),
];

function snapshot(id: string, domHash: string, html: string): Snapshot {
  return { id, projectId: 'prj_test', path: '/cart', domHash, html, boxes: {}, capturedAt: '2026-01-01T00:00:00.000Z' };
}

interface Spies {
  proposeHeal: ReturnType<typeof vi.fn>;
  releaseCreate: ReturnType<typeof vi.fn>;
  append: ReturnType<typeof vi.fn>;
  auditEvents: AuditEvent[];
}

function makeRegistry(spies: Spies, opts: { domChanged: boolean }): ServiceRegistry {
  const project = {
    id: 'prj_test',
    name: 'Test',
    upstreamOrigin: 'http://localhost:4200',
    paths: ['/cart'],
    liveReleaseId: 'rel_1',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  const live = {
    id: 'rel_1',
    projectId: 'prj_test',
    number: 1,
    patches: PATCHES,
    manifestHash: 'm',
    status: 'live',
    parentReleaseId: null,
    origin: 'head',
    note: '',
    createdBy: 'usr_a',
    createdAt: '2026-01-01T00:00:00.000Z',
    verificationRunId: null,
  } as Release;

  const audit = {
    append: spies.append,
    list: () => spies.auditEvents,
    verifyChain: () => ({ valid: true, brokenAtSeq: null }),
  };
  const core = {
    getProject: () => project,
    getPatch: () => null,
    listHead: () => [] as FrozenPatch[],
    createPreview: () => ({}) as never,
    getPreview: () => null,
    manifestForPreview: () => ({}) as never,
    proposeHeal: spies.proposeHeal,
  };
  const snapshots = {
    capture: async () => snapshot('snp_new', opts.domChanged ? HASH_AFTER : HASH_BEFORE, AFTER),
    latest: () => snapshot('snp_prev', HASH_BEFORE, BEFORE),
    get: () => null,
  };
  const verify = {
    start: () => ({}) as never,
    runToCompletion: async () => ({}) as never,
    get: () => null,
  };
  const releases = {
    create: spies.releaseCreate,
    get: (id: string) => (id === 'rel_1' ? live : null),
    list: () => [live],
    live: () => live,
    manifestForLive: () => ({}) as never,
    deploy: async () => ({}) as never,
    rollback: async () => ({}) as never,
    recordBeacon: () => undefined,
  };

  const registry = { audit, core, snapshots, verify, releases } as unknown as ServiceRegistry;
  return registry;
}

function makeSpies(): Spies {
  const auditEvents: AuditEvent[] = [];
  const append = vi.fn((e: Omit<AuditEvent, 'seq' | 'id' | 'prevHash' | 'hash' | 'createdAt'>) => {
    const ev = {
      seq: auditEvents.length + 1,
      id: `aud_${auditEvents.length + 1}`,
      prevHash: '0'.repeat(64),
      hash: 'hash',
      createdAt: '2026-01-01T00:00:00.000Z',
      ...e,
    } as AuditEvent;
    auditEvents.push(ev);
    return ev;
  });
  const proposeHeal = vi.fn(
    (patchId: string): Patch => ({ patchId, status: 'in_review' }) as unknown as Patch,
  );
  const releaseCreate = vi.fn(
    (_projectId: string, input: { patches?: FrozenPatch[] }): Release =>
      ({
        id: 'rel_quarantine',
        projectId: 'prj_test',
        number: 2,
        patches: input.patches ?? [],
        manifestHash: 'q',
        status: 'candidate',
        parentReleaseId: 'rel_1',
        origin: 'quarantine',
        note: 'q',
        createdBy: 'usr_a',
        createdAt: '2026-01-02T00:00:00.000Z',
        verificationRunId: null,
      }) as Release,
  );
  return { proposeHeal, releaseCreate, append, auditEvents };
}

function makeEnv(domChanged = true) {
  const db = openDb(':memory:');
  migrate(db);
  const spies = makeSpies();
  const registry = makeRegistry(spies, { domChanged });
  const benchDir = mkdtempSync(join(tmpdir(), 'pw-drift-'));
  const benchFile = join(benchDir, 'bench.json');
  const service = createDriftService(registry, db, { benchFile });
  registry.drift = service;
  return { db, spies, registry, service, benchDir, benchFile };
}

let env: ReturnType<typeof makeEnv> | undefined;

afterEach(() => {
  try {
    env?.db.close();
  } catch {
    // a route test that reuses no env leaves this undefined/invalid; nothing to close
  }
  if (env?.benchDir) rmSync(env.benchDir, { recursive: true, force: true });
  env = undefined;
});

describe('drift.check', () => {
  it('opens no report when the normalised DOM hash is unchanged', async () => {
    env = makeEnv(false);
    const reports = await env.service.check('prj_test', 'usr_a');
    expect(reports).toEqual([]);
    expect(env.service.list('prj_test')).toEqual([]);
    expect(env.spies.append).not.toHaveBeenCalled();
    expect(env.spies.proposeHeal).not.toHaveBeenCalled();
  });

  it('classifies each patch and proposes a heal for the relocated one', async () => {
    env = makeEnv(true);
    const reports = await env.service.check('prj_test', 'usr_a');

    expect(reports).toHaveLength(1);
    const report = reports[0]!;
    expect(report.projectId).toBe('prj_test');
    expect(report.releaseId).toBe('rel_1');
    expect(report.path).toBe('/cart');
    expect(report.previousSnapshotId).toBe('snp_prev');
    expect(report.snapshotId).toBe('snp_new');
    expect(report.quarantineReleaseId).toBeNull();
    expect(report.results.map((r) => r.health)).toEqual(['healthy', 'healed', 'broken']);

    const healed = report.results.find((r) => r.patchId === 'pat_healed')!;
    expect(healed.proposedFingerprints).not.toBeNull();
    expect(env.spies.proposeHeal).toHaveBeenCalledTimes(1);
    expect(env.spies.proposeHeal.mock.calls[0]![0]).toBe('pat_healed');
    expect(env.spies.proposeHeal.mock.calls[0]![2]).toBe('usr_a');

    const types = env.spies.auditEvents.map((e) => e.type);
    expect(types).toContain('drift.detected');
    expect(types).toContain('patch.heal_proposed');

    // persisted and readable back through list()
    const listed = env.service.list('prj_test');
    expect(listed).toHaveLength(1);
    expect(listed[0]!.id).toBe(report.id);
    expect(listed[0]!.results).toEqual(report.results);
  });

  it('throws NOT_FOUND for an unknown project and INVALID_STATE without a live release', async () => {
    env = makeEnv(true);
    const core = env.registry.core;
    const releases = env.registry.releases;
    env.registry.core = { ...core, getProject: () => null };
    await expect(env.service.check('prj_missing', 'usr_a')).rejects.toMatchObject({ code: 'NOT_FOUND' });

    env.registry.core = core;
    env.registry.releases = { ...releases, live: () => null };
    await expect(env.service.check('prj_test', 'usr_a')).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });
});

describe('drift.proposeQuarantine', () => {
  it('creates a release without the at_risk/broken patches and links it to the report', async () => {
    env = makeEnv(true);
    const [report] = await env.service.check('prj_test', 'usr_a');
    const quarantine = await env.service.proposeQuarantine(report!.id, 'usr_a');

    expect(env.spies.releaseCreate).toHaveBeenCalledTimes(1);
    const [, input] = env.spies.releaseCreate.mock.calls[0]!;
    expect(input.origin).toBe('quarantine');
    expect((input.patches as FrozenPatch[]).map((p) => p.patchId)).toEqual([
      'pat_healthy',
      'pat_healed',
    ]);
    expect(quarantine.id).toBe('rel_quarantine');
    expect(env.service.list('prj_test')[0]!.quarantineReleaseId).toBe('rel_quarantine');
    expect(env.spies.auditEvents.map((e) => e.type)).toContain('release.quarantine_proposed');
  });

  it('rejects a report with nothing unsafe', async () => {
    env = makeEnv(true);
    const repo = createDriftRepo(env.db);
    const safe: DriftReport = {
      id: 'drf_safe',
      projectId: 'prj_test',
      releaseId: 'rel_1',
      path: '/cart',
      previousSnapshotId: null,
      snapshotId: 'snp_new',
      createdAt: '2026-01-01T00:00:00.000Z',
      results: [
        {
          patchId: 'pat_healthy',
          revision: 1,
          health: 'healthy',
          resolutions: [],
          proposedFingerprints: null,
          assist: [],
        },
      ],
      quarantineReleaseId: null,
    };
    repo.insert(safe);
    await expect(env.service.proposeQuarantine('drf_safe', 'usr_a')).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
    await expect(env.service.proposeQuarantine('drf_missing', 'usr_a')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('drift.bench', () => {
  it('returns [] when no bench file exists, rows when it does, and fails loudly on garbage', () => {
    env = makeEnv(true);
    expect(env.service.bench()).toEqual([]);

    const rows: BenchRow[] = [
      { method: 'patchwork', set: 'dev', cases: 15, reanchorRate: 1, wrongTargetRate: 0, correctAbstainRate: 1 },
    ];
    writeFileSync(env.benchFile, JSON.stringify(rows), 'utf8');
    expect(env.service.bench()).toEqual(rows);

    writeFileSync(env.benchFile, '{not json', 'utf8');
    expect(() => env!.service.bench()).toThrow(/unreadable/);
  });
});

describe('registerDriftRoutes', () => {
  function fakeDrift() {
    return {
      check: vi.fn(async () => [] as DriftReport[]),
      list: vi.fn(() => [] as DriftReport[]),
      proposeQuarantine: vi.fn(async () => ({ id: 'rel_q' }) as unknown as Release),
      bench: vi.fn(() => [
        { method: 'patchwork', set: 'dev', cases: 1, reanchorRate: 1, wrongTargetRate: 0, correctAbstainRate: 1 },
      ] as BenchRow[]),
    };
  }

  it('serves bench, list and check over HTTP and passes the user header as the actor', async () => {
    const drift = fakeDrift();
    const app = Fastify();
    registerDriftRoutes(app, { drift } as unknown as ServiceRegistry);

    const bench = await app.inject({ method: 'GET', url: '/api/bench' });
    expect(bench.statusCode).toBe(200);
    expect(bench.json()).toEqual({ items: drift.bench.mock.results[0]!.value });

    const list = await app.inject({ method: 'GET', url: '/api/projects/prj_test/drift' });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual({ items: [] });
    expect(drift.list).toHaveBeenCalledWith('prj_test');

    const check = await app.inject({
      method: 'POST',
      url: '/api/projects/prj_test/drift/check',
      headers: { 'x-patchwork-user': 'usr_a' },
    });
    expect(check.statusCode).toBe(200);
    expect(drift.check).toHaveBeenCalledWith('prj_test', 'usr_a');

    const noHeader = await app.inject({ method: 'POST', url: '/api/projects/prj_test/drift/check' });
    expect(noHeader.statusCode).toBe(200);
    expect(drift.check).toHaveBeenLastCalledWith('prj_test', 'system');

    const quarantine = await app.inject({ method: 'POST', url: '/api/drift/drf_1/quarantine' });
    expect(quarantine.statusCode).toBe(200);
    expect(quarantine.json()).toEqual({ id: 'rel_q' });
    await app.close();
  });

  it('does not collide with an already-registered scaffold stub (hasRoute guard)', async () => {
    const drift = fakeDrift();
    const app = Fastify();
    app.get('/api/bench', async () => ({ stub: true }));
    expect(() => registerDriftRoutes(app, { drift } as unknown as ServiceRegistry)).not.toThrow();
    const res = await app.inject({ method: 'GET', url: '/api/bench' });
    expect(res.json()).toEqual({ stub: true });
    expect(drift.bench).not.toHaveBeenCalled();
    await app.close();
  });
});
