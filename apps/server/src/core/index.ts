// apps/server/src/core/index.ts (owner: Dev A)
// Phase 2 step 12: CoreService (PLAN 11.13). Projects, patches and head are real;
// previews and proposeHeal arrive in step 14.
import type { FrozenPatch, Patch, Preview, Project, RuntimeManifest } from '@patchwork/shared';
import type { CoreService } from '@patchwork/shared';
import type { ElementFingerprint, Id, PreviewSpec } from '@patchwork/shared';
import { AppError } from '@patchwork/shared';
import type { Db } from '../db/sqlite.js';
import { getPatch } from './patches.js';

type ProjectRow = {
  id: string;
  name: string;
  upstream_origin: string;
  paths_json: string;
  live_release_id: string | null;
  created_at: string;
};

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

const notYet = (fn: string): never => {
  throw new AppError('NOT_IMPLEMENTED', `core.${fn} arrives in Phase 2 step 14 (owner: Dev A)`);
};

export function createCoreService(db: Db): CoreService {
  return {
    getProject(id: Id): Project | null {
      const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined;
      return row ? rowToProject(row) : null;
    },

    getPatch(id: Id): Patch | null {
      return getPatch(db, id);
    },

    // Merged revisions in merge order = head (PLAN 11.3).
    listHead(projectId: Id): FrozenPatch[] {
      const rows = db
        .prepare(
          'SELECT * FROM patches WHERE project_id = ? AND status = ? AND merge_order IS NOT NULL ORDER BY merge_order',
        )
        .all(projectId, 'merged') as Array<{
        id: string;
        revision: number;
        merged_revision: number | null;
        title: string;
        body_json: string;
      }>;
      return rows.map((r) => {
        const body = JSON.parse(r.body_json) as Omit<FrozenPatch, 'patchId' | 'revision' | 'title'>;
        return { ...body, patchId: r.id, revision: r.merged_revision ?? r.revision, title: r.title };
      });
    },

    createPreview: (_projectId: Id, _spec: PreviewSpec, _actorId: Id): Preview =>
      notYet('createPreview'),

    getPreview: (id: Id): Preview | null => {
      const row = db
        .prepare('SELECT * FROM previews WHERE id = ?')
        .get(id) as { id: string; project_id: string; spec_json: string; created_by: string; created_at: string; expires_at: string } | undefined;
      if (!row) return null;
      return {
        id: row.id,
        projectId: row.project_id,
        spec: JSON.parse(row.spec_json) as PreviewSpec,
        createdBy: row.created_by,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
      };
    },

    manifestForPreview: (_previewId: Id): RuntimeManifest => notYet('manifestForPreview'),

    // Drift heal (PLAN 11.13): lands in step 14 with previews.
    proposeHeal: (
      _patchId: Id,
      _anchors: Record<string, ElementFingerprint>,
      _actorId: Id | 'system',
      _note: string,
    ): Patch => notYet('proposeHeal'),
  };
}
