// scripts/seed.ts (owner: Dev A)
// Inserts the deterministic seed data (PLAN section 13.3 step 15) into the SQLite db.
// Idempotent: INSERT OR REPLACE, so re-running is safe.
import { fileURLToPath } from 'node:url';
import { openDb } from '../apps/server/src/db/sqlite.js';
import { migrate } from '../apps/server/src/db/migrate.js';
import { loadEnvFromDisk } from '../apps/server/src/env.js';
import { SEED_PROJECT, SEED_USERS } from '../apps/server/src/db/seed-data.js';

const env = await loadEnvFromDisk(fileURLToPath(new URL('../.env', import.meta.url)));
const db = openDb(env.PW_DB_PATH);
migrate(db);

const insertUser = db.prepare('INSERT OR REPLACE INTO users (id, name, role) VALUES (?, ?, ?)');
for (const u of SEED_USERS) insertUser.run(u.id, u.name, u.role);

db.prepare(
  'INSERT OR REPLACE INTO projects (id, name, upstream_origin, paths_json, live_release_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
).run(
  SEED_PROJECT.id,
  SEED_PROJECT.name,
  SEED_PROJECT.upstreamOrigin,
  JSON.stringify(SEED_PROJECT.paths),
  null,
  SEED_PROJECT.createdAt,
);

db.close();
console.log(`[seed] ${SEED_USERS.length} users + project ${SEED_PROJECT.id} -> ${env.PW_DB_PATH}`);
