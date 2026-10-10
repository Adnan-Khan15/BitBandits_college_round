// apps/server/src/core/repo.ts (owner: Dev A)
// SQL for the tables core owns (PLAN 11.15): projects, patches, patch_revisions, previews.
import type {
  FrozenPatch,
  Id,
  Patch,
  PatchBody,
  PatchStatus,
  Preview,
  PreviewSpec,
  Project,
} from '@patchwork/shared';
import type { Db } from '../db/sqlite.js';

interface ProjectRow {
  id: string;
  name: string;
  upstream_origin: string;
  paths_json: string;
  live_release_id: string | null;
  created_at: string;
}

interface PatchRow {
  id: string;
  project_id: string;
  title: string;
  description: string;
  author_id: string;
  status: string;
  revision: number;
  merged_revision: number | null;
  merge_order: number | null;
  body_json: string;
  created_at: string;
  updated_at: string;
}

interface PreviewRow {
  id: string;
  project_id: string;
  spec_json: string;
  created_by: string;
  created_at: string;
  expires_at: string;
}

/** Only the PatchBody fields, in contract order, so stray keys never reach body_json. */
export function pickBody(b: PatchBody): PatchBody {
  return {
    urlPath: b.urlPath,
    anchors: b.anchors,
    ops: b.ops,
    checks: b.checks,
    baseSnapshotId: b.baseSnapshotId,
    baseValues: b.baseValues,
  };
}

function rowToProject(r: ProjectRow): Project {
  return {
    id: r.id,
    name: r.name,
    upstreamOrigin: r.upstream_origin,
    paths: JSON.parse(r.paths_json) as string[],
    liveReleaseId: r.live_release_id,
    createdAt: r.created_at,
  };
}

function rowToPatch(r: PatchRow): Patch {
  const body = JSON.parse(r.body_json) as PatchBody;
  return {
    ...pickBody(body),
    id: r.id,
    projectId: r.project_id,
    title: r.title,
    description: r.description,
    authorId: r.author_id,
    status: r.status as PatchStatus,
    revision: r.revision,
    mergedRevision: r.merged_revision,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToPreview(r: PreviewRow): Preview {
  return {
    id: r.id,
    projectId: r.project_id,
    spec: JSON.parse(r.spec_json) as PreviewSpec,
    createdBy: r.created_by,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
  };
}

export interface CoreRepo {
  getProject(id: Id): Project | null;
  listProjects(): Project[];
  insertProject(p: Project): void;
  getPatch(id: Id): Patch | null;
  listPatches(projectId: Id, status?: PatchStatus): Patch[];
  insertPatch(p: Patch): void;
  /** Rewrites the mutable columns of an existing patch row. */
  updatePatch(p: Patch): void;
  insertRevision(patchId: Id, revision: number, title: string, body: PatchBody, authorId: Id): void;
  getRevision(patchId: Id, revision: number): { title: string; body: PatchBody } | null;
  setMerged(patchId: Id, mergedRevision: number, mergeOrder: number): void;
  maxMergeOrder(projectId: Id): number;
  mergeOrderOf(patchId: Id): number | null;
  /** Shift every merged patch at or after `fromOrder` one slot later. */
  shiftMergeOrder(projectId: Id, fromOrder: number): void;
  listHead(projectId: Id): FrozenPatch[];
  insertPreview(p: Preview): void;
  updatePreviewSpec(id: Id, spec: PreviewSpec, expiresAt: string): void;
  getPreview(id: Id): Preview | null;
}

export function createCoreRepo(db: Db): CoreRepo {
  const getRevision: CoreRepo['getRevision'] = (patchId, revision) => {
    const row = db
      .prepare('SELECT title, body_json FROM patch_revisions WHERE patch_id = ? AND revision = ?')
      .get(patchId, revision) as { title: string; body_json: string } | undefined;
    return row ? { title: row.title, body: pickBody(JSON.parse(row.body_json) as PatchBody) } : null;
  };

  return {
    listProjects() {
      const rows = db.prepare('SELECT * FROM projects ORDER BY created_at, id').all() as unknown as ProjectRow[];
      return rows.map(rowToProject);
    },

    insertProject(p) {
      db.prepare(
        'INSERT INTO projects (id, name, upstream_origin, paths_json, live_release_id, created_at) VALUES (?, ?, ?, ?, NULL, ?)',
      ).run(p.id, p.name, p.upstreamOrigin, JSON.stringify(p.paths), p.createdAt);
    },

    getProject(id) {
      const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as unknown as
        | ProjectRow
        | undefined;
      return row ? rowToProject(row) : null;
    },

    getPatch(id) {
      const row = db.prepare('SELECT * FROM patches WHERE id = ?').get(id) as unknown as
        | PatchRow
        | undefined;
      return row ? rowToPatch(row) : null;
    },

    listPatches(projectId, status) {
      const rows = (
        status
          ? db
              .prepare('SELECT * FROM patches WHERE project_id = ? AND status = ? ORDER BY updated_at DESC')
              .all(projectId, status)
          : db.prepare('SELECT * FROM patches WHERE project_id = ? ORDER BY updated_at DESC').all(projectId)
      ) as unknown as PatchRow[];
      return rows.map(rowToPatch);
    },

    insertPatch(p) {
      db.prepare(
        `INSERT INTO patches
           (id, project_id, title, description, author_id, status, revision, merged_revision, merge_order, body_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
      ).run(
        p.id,
        p.projectId,
        p.title,
        p.description,
        p.authorId,
        p.status,
        p.revision,
        p.mergedRevision,
        JSON.stringify(pickBody(p)),
        p.createdAt,
        p.updatedAt,
      );
    },

    updatePatch(p) {
      db.prepare(
        `UPDATE patches SET title = ?, description = ?, status = ?, revision = ?, merged_revision = ?,
           body_json = ?, updated_at = ? WHERE id = ?`,
      ).run(
        p.title,
        p.description,
        p.status,
        p.revision,
        p.mergedRevision,
        JSON.stringify(pickBody(p)),
        p.updatedAt,
        p.id,
      );
    },

    insertRevision(patchId, revision, title, body, authorId) {
      db.prepare(
        `INSERT INTO patch_revisions (patch_id, revision, title, body_json, author_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(patchId, revision, title, JSON.stringify(pickBody(body)), authorId, new Date().toISOString());
    },

    getRevision,

    setMerged(patchId, mergedRevision, mergeOrder) {
      db.prepare('UPDATE patches SET merged_revision = ?, merge_order = ? WHERE id = ?').run(
        mergedRevision,
        mergeOrder,
        patchId,
      );
    },

    maxMergeOrder(projectId) {
      const row = db
        .prepare('SELECT COALESCE(MAX(merge_order), 0) AS m FROM patches WHERE project_id = ?')
        .get(projectId) as { m: number };
      return row.m;
    },

    mergeOrderOf(patchId) {
      const row = db.prepare('SELECT merge_order FROM patches WHERE id = ?').get(patchId) as
        | { merge_order: number | null }
        | undefined;
      return row?.merge_order ?? null;
    },

    shiftMergeOrder(projectId, fromOrder) {
      db.prepare(
        'UPDATE patches SET merge_order = merge_order + 1 WHERE project_id = ? AND merge_order >= ?',
      ).run(projectId, fromOrder);
    },

    listHead(projectId) {
      const rows = db
        .prepare(
          `SELECT id, merged_revision FROM patches
            WHERE project_id = ? AND merged_revision IS NOT NULL
            ORDER BY merge_order ASC, id ASC`,
        )
        .all(projectId) as Array<{ id: string; merged_revision: number }>;
      const head: FrozenPatch[] = [];
      for (const row of rows) {
        const rev = getRevision(row.id, row.merged_revision);
        if (!rev) continue; // every save writes a revision row, so this only guards corrupt data
        head.push({ ...rev.body, patchId: row.id, revision: row.merged_revision, title: rev.title });
      }
      return head;
    },

    insertPreview(p) {
      db.prepare(
        `INSERT INTO previews (id, project_id, spec_json, created_by, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(p.id, p.projectId, JSON.stringify(p.spec), p.createdBy, p.createdAt, p.expiresAt);
    },

    updatePreviewSpec(id, spec, expiresAt) {
      db.prepare('UPDATE previews SET spec_json = ?, expires_at = ? WHERE id = ?').run(
        JSON.stringify(spec),
        expiresAt,
        id,
      );
    },

    getPreview(id) {
      const row = db.prepare('SELECT * FROM previews WHERE id = ?').get(id) as unknown as
        | PreviewRow
        | undefined;
      return row ? rowToPreview(row) : null;
    },
  };
}
