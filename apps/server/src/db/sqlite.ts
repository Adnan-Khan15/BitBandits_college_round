// apps/server/src/db/sqlite.ts (owner: Dev A)
// One SQLite file via Node 24's built-in node:sqlite (PLAN section 8). Fallback if it
// misbehaves on a machine: better-sqlite3, same SQL (PLAN section 19 risk 6).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type Db = DatabaseSync;

export function openDb(path: string): Db {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  return new DatabaseSync(path);
}
