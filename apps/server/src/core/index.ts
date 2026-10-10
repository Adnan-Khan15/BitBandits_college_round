// apps/server/src/core/index.ts (owner: Dev A)
// CoreService (PLAN 11.13): projects, patches, previews, head, proposeHeal.
// Other modules are reached lazily through the registry at call time, never imported.
import { nanoid } from 'nanoid';
import { AppError, DEFAULT_THRESHOLDS } from '@patchwork/shared';
import type {
  CoreService,
  ElementFingerprint,
  FrozenPatch,
  Id,
  Patch,
  Preview,
  PreviewSpec,
  RuntimeManifest,
  ServiceRegistry,
} from '@patchwork/shared';
import type { Db } from '../db/sqlite.js';
import { loadEnv, type Env } from '../env.js';
import { createCoreRepo, pickBody, type CoreRepo } from './repo.js';

export const PREVIEW_TTL_MS = 2 * 60 * 60 * 1000; // 2 h (PLAN 11.6)

export const newId = (prefix: string): Id => `${prefix}_${nanoid(12)}`;

export interface CoreServiceExt extends CoreService {
  /** Row access for core/routes.ts (same module folder). */
  repo: CoreRepo;
  /** Preview spec replacement for PUT /previews/:id; also renews the 2 h expiry. */
  updatePreview(id: Id, spec: PreviewSpec): Preview;
}

export function createCoreService(
  db: Db,
  registry: ServiceRegistry,
  env: Env = loadEnv(),
): CoreServiceExt {
  const repo = createCoreRepo(db);

  const requireProject = (id: Id) => {
    const project = repo.getProject(id);
    if (!project) throw new AppError('NOT_FOUND', `No project ${id}`);
    return project;
  };

  const frozenCurrent = (patch: Patch): FrozenPatch => ({
    ...pickBody(patch),
    patchId: patch.id,
    revision: patch.revision,
    title: patch.title,
  });

  const basePatches = (preview: Preview): { releaseId: Id | null; patches: FrozenPatch[] } => {
    const { base } = preview.spec;
    if (base === 'head') return { releaseId: null, patches: repo.listHead(preview.projectId) };
    if (base === 'live') {
      const live = registry.releases.live(preview.projectId);
      return { releaseId: live?.id ?? null, patches: live?.patches ?? [] };
    }
    const release = registry.releases.get(base.releaseId);
    if (!release || release.projectId !== preview.projectId) {
      throw new AppError('NOT_FOUND', `No release ${base.releaseId} in project ${preview.projectId}`);
    }
    return { releaseId: release.id, patches: release.patches };
  };

  return {
    repo,

    getProject: (id) => repo.getProject(id),

    getPatch: (id) => repo.getPatch(id),

    listHead: (projectId) => repo.listHead(projectId),

    createPreview(projectId, spec, actorId): Preview {
      requireProject(projectId);
      const now = Date.now();
      const preview: Preview = {
        id: newId('prv'),
        projectId,
        spec,
        createdBy: actorId,
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + PREVIEW_TTL_MS).toISOString(),
      };
      repo.insertPreview(preview);
      registry.audit.append({
        projectId,
        type: 'preview.created',
        actorId,
        subject: { type: 'preview', id: preview.id },
        data: {
          base: spec.base,
          include: spec.include,
          exclude: spec.exclude,
          draft: spec.draft ? spec.draft.title : null,
          resolverMode: spec.resolverMode,
        },
      });
      return preview;
    },

    updatePreview(id, spec): Preview {
      const existing = repo.getPreview(id);
      if (!existing) throw new AppError('NOT_FOUND', `No preview ${id}`);
      const expiresAt = new Date(Date.now() + PREVIEW_TTL_MS).toISOString();
      repo.updatePreviewSpec(id, spec, expiresAt);
      return { ...existing, spec, expiresAt };
    },

    getPreview: (id) => repo.getPreview(id),

    manifestForPreview(previewId): RuntimeManifest {
      const preview = repo.getPreview(previewId);
      if (!preview) throw new AppError('NOT_FOUND', `No preview ${previewId}`);
      if (Date.parse(preview.expiresAt) <= Date.now()) {
        throw new AppError('NOT_FOUND', `Preview ${previewId} expired at ${preview.expiresAt}`);
      }
      const { spec } = preview;
      const { releaseId, patches: base } = basePatches(preview);

      // base + include - exclude: an included patch replaces its base entry with its current revision.
      const dropped = new Set([...spec.include, ...spec.exclude]);
      const patches: FrozenPatch[] = base.filter((p) => !dropped.has(p.patchId));
      const excluded = new Set(spec.exclude);
      for (const id of spec.include) {
        if (excluded.has(id)) continue;
        const patch = repo.getPatch(id);
        if (!patch || patch.projectId !== preview.projectId) {
          throw new AppError('NOT_FOUND', `Preview ${previewId} includes unknown patch ${id}`);
        }
        patches.push(frozenCurrent(patch));
      }
      if (spec.draft) {
        const { title, ...body } = spec.draft;
        patches.push({ ...pickBody(body), patchId: 'draft', revision: 0, title });
      }

      return {
        channel: 'preview',
        projectId: preview.projectId,
        releaseId,
        previewId: preview.id,
        resolverMode: spec.resolverMode,
        patches,
        editor: { enabled: true, allowedOrigin: env.PW_EDITOR_ORIGIN },
        beaconUrl: '/__patchwork/beacon',
        thresholds: { ...DEFAULT_THRESHOLDS },
      };
    },

    proposeHeal(
      patchId: Id,
      anchors: Record<string, ElementFingerprint>,
      actorId: Id | 'system',
      _note: string,
    ): Patch {
      const patch = repo.getPatch(patchId);
      if (!patch) throw new AppError('NOT_FOUND', `No patch ${patchId}`);
      if (patch.mergedRevision === null) {
        throw new AppError('INVALID_STATE', `Patch ${patchId} is not merged; nothing to heal`);
      }
      const healed: Patch = {
        ...patch,
        anchors: { ...patch.anchors, ...anchors },
        status: 'in_review',
        revision: patch.revision + 1,
        updatedAt: new Date().toISOString(),
      };
      db.exec('BEGIN');
      try {
        repo.insertRevision(patchId, healed.revision, healed.title, healed, actorId);
        repo.updatePatch(healed);
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
      // The audit event (patch.heal_proposed) is appended by the caller, which knows the
      // drift report it came from (drift/index.ts), so the trail holds exactly one event.
      return healed;
    },
  };
}
