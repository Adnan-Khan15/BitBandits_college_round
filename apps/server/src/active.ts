// apps/server/src/active.ts (owner: Dev A)
// The site the live (:4100) and preview (:4300) gateways serve right now. One active site at a time
// (full multi-tenant routing is out of scope). Persisted in data/active-project.json, not the schema.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

let activeId: string | null = null;
let file: string | null = null;
let fallback = 'prj_shoplite';

/** Called once by main.ts: the file lives next to the database; the default is PW_PROJECT_ID. */
export function initActiveProject(dbPath: string, defaultId: string): void {
  fallback = defaultId;
  file = dbPath === ':memory:' ? null : join(dirname(dbPath), 'active-project.json');
  activeId = null;
  if (!file) return;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { activeProjectId?: unknown };
    if (typeof parsed.activeProjectId === 'string' && parsed.activeProjectId !== '') activeId = parsed.activeProjectId;
  } catch {
    activeId = null; // no file yet: the default site
  }
}

export function getActiveProjectId(): string {
  return activeId ?? fallback;
}

export function setActiveProjectId(id: string): void {
  activeId = id;
  if (!file) return;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ activeProjectId: id }, null, 2));
}
