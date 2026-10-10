// apps/server/test/scaffold.test.ts (owner: Dev A) - scaffold smoke test.
import { afterAll, describe, expect, it } from 'vitest';
import { migrate } from '../src/db/migrate.js';
import { openDb, type Db } from '../src/db/sqlite.js';
import { loadEnv, parseDotEnv } from '../src/env.js';
import { SEED_PROJECT, SEED_USERS } from '../src/db/seed-data.js';
import { buildControlApp } from '../src/app.js';
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

  it('answers stub routes with 501 NOT_IMPLEMENTED in the ApiError shape', async () => {
    const app = buildControlApp({ registry: buildRegistry(db), db });
    const res = await app.inject({ method: 'GET', url: '/api/bench' });
    expect(res.statusCode).toBe(501);
    const body = res.json() as { error: { code: string; requestId: string } };
    expect(body.error.code).toBe('NOT_IMPLEMENTED');
    expect(typeof body.error.requestId).toBe('string');
    await app.close();
  });
});
