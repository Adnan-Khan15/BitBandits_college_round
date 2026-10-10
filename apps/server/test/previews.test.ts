// apps/server/test/previews.test.ts (owner: Dev A) - Phase 2 step 14.
// Route tests via fastify.inject for previews (PLAN 11.12): POST creates and returns
// {preview, url} on PW_PREVIEW_ORIGIN; PUT replaces the spec; roles/project errors.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Preview, PreviewSpec } from '@patchwork/shared';
import { USER_HEADER } from '@patchwork/shared';
import { buildControlApp } from '../src/app.js';
import { buildRegistry } from '../src/registry.js';
import { migrate } from '../src/db/migrate.js';
import { openDb, type Db } from '../src/db/sqlite.js';
import { SEED_PROJECT, SEED_USERS } from '../src/db/seed-data.js';

const PREVIEW_ORIGIN = 'http://preview.test:9999';
const SPEC: PreviewSpec = { base: 'head', include: [], exclude: [], draft: null, resolverMode: 'smart' };

let db: Db;

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

function app() {
  const registry = buildRegistry(db, { editorOrigin: 'http://editor.test', previewOrigin: PREVIEW_ORIGIN });
  return buildControlApp({ registry, db, previewOrigin: PREVIEW_ORIGIN });
}

const H = (id: string) => ({ [USER_HEADER]: id });

beforeEach(() => {
  db = freshDb();
});
afterEach(() => db.close());

describe('preview routes', () => {
  it('POST /api/projects/:pid/previews returns {preview, url} on PW_PREVIEW_ORIGIN', async () => {
    const a = app();
    const res = await a.inject({
      method: 'POST',
      url: `/api/projects/${SEED_PROJECT.id}/previews`,
      headers: H('usr_dev1'),
      payload: SPEC,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { preview: Preview; url: string };
    expect(body.preview.projectId).toBe(SEED_PROJECT.id);
    expect(body.preview.spec.resolverMode).toBe('smart');
    expect(body.url).toBe(`${PREVIEW_ORIGIN}/__patchwork/preview/${body.preview.id}?path=%2F`);
    await a.close();
  });

  it('POST /previews 403s without a user header', async () => {
    const a = app();
    const res = await a.inject({
      method: 'POST',
      url: `/api/projects/${SEED_PROJECT.id}/previews`,
      payload: SPEC,
    });
    expect(res.statusCode).toBe(403);
    await a.close();
  });

  it('POST /previews 404s an unknown project', async () => {
    const a = app();
    const res = await a.inject({
      method: 'POST',
      url: '/api/projects/prj_nope/previews',
      headers: H('usr_dev1'),
      payload: SPEC,
    });
    expect(res.statusCode).toBe(404);
    await a.close();
  });

  it('PUT /api/previews/:id replaces the spec; unknown id 404s', async () => {
    const a = app();
    const created = await a.inject({
      method: 'POST',
      url: `/api/projects/${SEED_PROJECT.id}/previews`,
      headers: H('usr_dev1'),
      payload: SPEC,
    });
    const id = (created.json() as { preview: Preview }).preview.id;

    const res = await a.inject({
      method: 'PUT',
      url: `/api/previews/${id}`,
      headers: H('usr_dev1'),
      payload: { ...SPEC, resolverMode: 'selector' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { preview: Preview; url: string };
    expect(body.preview.id).toBe(id);
    expect(body.preview.spec.resolverMode).toBe('selector');
    expect(body.url).toContain(`/__patchwork/preview/${id}`);

    const missing = await a.inject({
      method: 'PUT',
      url: '/api/previews/prv_nope',
      headers: H('usr_dev1'),
      payload: SPEC,
    });
    expect(missing.statusCode).toBe(404);
    await a.close();
  });
});
