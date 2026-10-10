// apps/server/src/releases/index.ts (owner: Dev C)
// Releases (PLAN 11.8): freeze head, verify gate, deploy (one pointer move), health, rollback, beacons.
// Solo Phase 1: read side (get/list/live/manifestForLive) + beacons. create/deploy/rollback land in Phase 2.
import type { FastifyInstance } from 'fastify';
import { AppError, DEFAULT_THRESHOLDS } from '@patchwork/shared';
import type {
  BeaconPayload,
  FrozenPatch,
  Id,
  Release,
  ReleaseService,
  ReleaseStatus,
  RuntimeManifest,
  ServiceRegistry,
} from '@patchwork/shared';
import type { Db } from '../db/sqlite.js';

const notImplemented = (fn: string): never => {
  throw new AppError('NOT_IMPLEMENTED', `releases.${fn} lands in solo Phase 2 (owner: Dev C)`);
};

interface ReleaseRow {
  id: string;
  project_id: string;
  number: number;
  patches_json: string;
  manifest_hash: string;
  status: string;
  parent_release_id: string | null;
  origin: string;
  note: string;
  created_by: string;
  created_at: string;
  verification_run_id: string | null;
}

function rowToRelease(r: ReleaseRow): Release {
  return {
    id: r.id,
    projectId: r.project_id,
    number: r.number,
    patches: JSON.parse(r.patches_json) as FrozenPatch[],
    manifestHash: r.manifest_hash,
    status: r.status as ReleaseStatus,
    parentReleaseId: r.parent_release_id,
    origin: r.origin as Release['origin'],
    note: r.note,
    createdBy: r.created_by,
    createdAt: r.created_at,
    verificationRunId: r.verification_run_id,
  };
}

export function createReleaseService(db: Db, _registry: ServiceRegistry): ReleaseService {
  const get = (id: Id): Release | null => {
    const row = db.prepare('SELECT * FROM releases WHERE id = ?').get(id) as unknown as
      | ReleaseRow
      | undefined;
    return row ? rowToRelease(row) : null;
  };

  const live = (projectId: Id): Release | null => {
    const row = db.prepare('SELECT live_release_id FROM projects WHERE id = ?').get(projectId) as
      | { live_release_id: string | null }
      | undefined;
    if (!row) throw new AppError('NOT_FOUND', `No project ${projectId}`);
    return row.live_release_id ? get(row.live_release_id) : null;
  };

  return {
    create: () => notImplemented('create'),

    get,

    list(projectId): Release[] {
      const rows = db
        .prepare('SELECT * FROM releases WHERE project_id = ? ORDER BY number DESC')
        .all(projectId) as unknown as ReleaseRow[];
      return rows.map(rowToRelease);
    },

    live,

    manifestForLive(projectId): RuntimeManifest {
      const release = live(projectId);
      return {
        channel: 'live',
        projectId,
        releaseId: release?.id ?? null,
        previewId: null,
        resolverMode: 'smart',
        patches: release?.patches ?? [],
        editor: { enabled: false, allowedOrigin: null },
        beaconUrl: '/__patchwork/beacon',
        thresholds: { ...DEFAULT_THRESHOLDS },
      };
    },

    deploy: () => notImplemented('deploy'),

    rollback: () => notImplemented('rollback'),

    recordBeacon(p: BeaconPayload): void {
      const insert = db.prepare(
        `INSERT INTO runtime_events
           (project_id, channel, release_id, preview_id, path, type, patch_id, detail_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const now = new Date().toISOString();
      for (const e of p.events) {
        const patchId = e.type === 'js_error' ? null : e.patchId;
        insert.run(p.projectId, p.channel, p.releaseId, p.previewId, p.path, e.type, patchId, JSON.stringify(e), now);
      }
    },
  };
}

export function registerReleaseRoutes(_app: FastifyInstance, _registry: ServiceRegistry): void {
  // GET|POST /api/projects/:pid/releases, POST /api/releases/:id/{verify,deploy},
  // POST /api/projects/:pid/rollback, GET /api/projects/:pid/deployments land in solo Phase 2.
}
