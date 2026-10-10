// apps/server/src/core/index.ts (owner: Dev A)
// CoreService (PLAN 11.13): projects, patches and head (step 12), previews and the
// drift heal (step 14).
import type {
  CoreService,
  ElementFingerprint,
  FrozenPatch,
  Id,
  Patch,
  Preview,
  PreviewSpec,
  Project,
  RuntimeManifest,
  ServiceRegistry,
} from '@patchwork/shared';
import type { Db } from '../db/sqlite.js';
import { getPatch, proposeHeal as proposeHealRevision } from './patches.js';
import {
  buildManifest,
  createPreviewRow,
  getPreviewRow,
  type PreviewConfig,
  DEFAULT_PREVIEW_CONFIG,
} from './previews.js';

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

type HeadRow = {
  id: string;
  revision: number;
  merged_revision: number;
  title: string;
  body_json: string;
  rev_body_json: string | null;
  rev_title: string | null;
};

export function createCoreService(
  db: Db,
  registry: ServiceRegistry,
  config: PreviewConfig = DEFAULT_PREVIEW_CONFIG,
): CoreService {
  return {
    getProject(id: Id): Project | null {
      const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined;
      return row ? rowToProject(row) : null;
    },

    getPatch(id: Id): Patch | null {
      return getPatch(db, id);
    },

    // Merged revisions in merge order = head (PLAN 11.3). A patch edited or healed after a
    // merge keeps merge_order/merged_revision, and its merged body is read from the archived
    // revision row so head keeps serving the live revision until the new one is merged.
    listHead(projectId: Id): FrozenPatch[] {
      const rows = db
        .prepare(
          `SELECT p.id, p.revision, p.merged_revision, p.title, p.body_json,
                  r.body_json AS rev_body_json, r.title AS rev_title
           FROM patches p
           LEFT JOIN patch_revisions r ON r.patch_id = p.id AND r.revision = p.merged_revision
           WHERE p.project_id = ? AND p.merge_order IS NOT NULL AND p.merged_revision IS NOT NULL
           ORDER BY p.merge_order`,
        )
        .all(projectId) as HeadRow[];
      return rows.map((r) => {
        const archived = r.merged_revision !== r.revision && r.rev_body_json !== null;
        const json = (archived ? r.rev_body_json : r.body_json) as string;
        const title = archived ? (r.rev_title ?? r.title) : r.title;
        const body = JSON.parse(json) as Omit<FrozenPatch, 'patchId' | 'revision' | 'title'>;
        return { ...body, patchId: r.id, revision: r.merged_revision, title };
      });
    },

    createPreview(projectId: Id, spec: PreviewSpec, actorId: Id): Preview {
      return createPreviewRow(db, registry, projectId, spec, actorId);
    },

    getPreview(id: Id): Preview | null {
      return getPreviewRow(db, id);
    },

    manifestForPreview(previewId: Id): RuntimeManifest {
      return buildManifest(db, registry, config, previewId);
    },

    proposeHeal(
      patchId: Id,
      anchors: Record<string, ElementFingerprint>,
      actorId: Id | 'system',
      note: string,
    ): Patch {
      return proposeHealRevision(db, registry.audit, patchId, anchors, actorId, note);
    },
  };
}
