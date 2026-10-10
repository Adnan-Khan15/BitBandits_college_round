// apps/server/src/db/migrate.ts (owner: Dev A)
// Applies schema.sql if the tables are missing. All statements are IF NOT EXISTS, so
// running it on an existing database is a no-op.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Db } from './sqlite.js';

const SCHEMA_PATH = fileURLToPath(new URL('./schema.sql', import.meta.url));

export function migrate(db: Db): void {
  const sql = readFileSync(SCHEMA_PATH, 'utf8');
  db.exec(sql);
}
