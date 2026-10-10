// apps/server/test/scaffold.test.ts (owner: Dev A) - scaffold smoke test.
import { afterAll, describe, expect, it } from 'vitest';
import { migrate } from '../src/db/migrate.js';
import { openDb, type Db } from '../src/db/sqlite.js';
import { loadEnv, parseDotEnv } from '../src/env.js';
import { SEED_PROJECT, SEED_USERS } from '../src/db/seed-data.js';
import { buildControlApp, STUB_ROUTES } from '../src/app.js';
import { buildRegistry } from '../src/registry.js';

const db: Db = openDb(':memory:');
migrate(db);

afterAll(() => db.close());

describe('scaffold', () => {
  it('applies schema.sql to a fresh database', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name);
    for (const expected of ['users', 'projects', 'patches', 'audit_events', 'releases', 'drift_reports']) {
      expect(names).toContain(expected);
    }
  });

  it('parses .env style files and applies defaults', () => {
    const dotenv = parseDotEnv('# comment\nPW_CONTROL_PORT=4111\nPW_ASSIST_PROVIDER=none\n');
    const env = loadEnv({}, dotenv);
    expect(env.PW_CONTROL_PORT).toBe(4111);
    expect(env.PW_LIVE_PORT).toBe(4100);
    expect(env.PW_ALLOWED_UPSTREAMS).toEqual(['http://localhost:4200']);
  });

  it('serves GET /api/users with the seeded users', async () => {
    const insert = db.prepare('INSERT OR REPLACE INTO users (id, name, role) VALUES (?, ?, ?)');
    for (const u of SEED_USERS) insert.run(u.id, u.name, u.role);
    const app = buildControlApp({ registry: buildRegistry(db), db });
    const res = await app.inject({ method: 'GET', url: '/api/users' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: Array<{ id: string }> };
    expect(body.items.map((u) => u.id)).toEqual(SEED_USERS.map((u) => u.id));
    await app.close();
  });

  it('serves GET /api/projects/:pid in the contract shape', async () => {
    db.prepare(
      'INSERT OR REPLACE INTO projects (id, name, upstream_origin, paths_json, live_release_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(SEED_PROJECT.id, SEED_PROJECT.name, SEED_PROJECT.upstreamOrigin, JSON.stringify(SEED_PROJECT.paths), null, SEED_PROJECT.createdAt);
    const app = buildControlApp({ registry: buildRegistry(db), db });
    const res = await app.inject({ method: 'GET', url: `/api/projects/${SEED_PROJECT.id}` });
    expect(res.statusCode).toBe(200);
    const project = res.json() as { paths: string[]; upstreamOrigin: string };
    expect(project.paths).toEqual(['/', '/cart', '/checkout']);
    expect(project.upstreamOrigin).toBe('http://localhost:4200');
    await app.close();
  });

  it('answers A-owned stub routes with 501 NOT_IMPLEMENTED in the ApiError shape', async () => {
    const app = buildControlApp({ registry: buildRegistry(db), db });
    const res = await app.inject({ method: 'POST', url: '/api/projects/prj_nope/previews' });
    expect(res.statusCode).toBe(501);
    const body = res.json() as { error: { code: string; requestId: string } };
    expect(body.error.code).toBe('NOT_IMPLEMENTED');
    expect(typeof body.error.requestId).toBe('string');
    await app.close();
  });

  it('answers unknown routes with 404 in the ApiError shape (B- and C-owned routes are theirs to register)', async () => {
    const app = buildControlApp({ registry: buildRegistry(db), db });
    const res = await app.inject({ method: 'GET', url: '/api/no-such-route' });
    expect(res.statusCode).toBe(404);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
    await app.close();
  });

  // Regression: duplicate-route boot failure (FST_ERR_DUPLICATED_ROUTES) seen by Dev C.
  // Dev A must not pre-register routes that Dev B or Dev C own - each owner's
  // register* function is the sole registrant of its own routes (PLAN 11.12, 11.17).
  it('pre-registers no route owned by Dev B or Dev C', async () => {
    const bcOwned: Array<{ method: string; url: string }> = [
      { method: 'POST', url: '/api/projects/:pid/snapshots' },
      { method: 'GET', url: '/api/projects/:pid/releases' },
      { method: 'POST', url: '/api/projects/:pid/releases' },
      { method: 'POST', url: '/api/releases/:id/verify' },
      { method: 'POST', url: '/api/releases/:id/deploy' },
      { method: 'POST', url: '/api/projects/:pid/rollback' },
      { method: 'GET', url: '/api/projects/:pid/deployments' },
      { method: 'POST', url: '/api/projects/:pid/verifications' },
      { method: 'GET', url: '/api/verifications/:id' },
      { method: 'GET', url: '/api/artifacts/:file' },
      { method: 'POST', url: '/api/projects/:pid/drift/check' },
      { method: 'GET', url: '/api/projects/:pid/drift' },
      { method: 'POST', url: '/api/drift/:id/quarantine' },
      { method: 'GET', url: '/api/bench' },
    ];
    const overlaps = STUB_ROUTES.filter((stub) =>
      bcOwned.some((owned) => owned.url === stub.url && owned.method === stub.method),
    );
    expect(overlaps).toEqual([]);
  });

  it('boots when an owner re-registers its real routes (no duplicate-route error)', async () => {
    // Simulates Dev C landing releases/snapshots/verify routes on the same app.
    const registry = buildRegistry(db);
    const app = buildControlApp({ registry, db });
    app.get('/api/projects/:pid/releases', async () => ({ items: [] }));
    app.post('/api/projects/:pid/snapshots', async () => ({ id: 'snp_1' }));
    await app.ready(); // must not throw FST_ERR_DUPLICATED_ROUTES
    const res = await app.inject({ method: 'GET', url: '/api/no-such-route' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
